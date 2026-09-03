'use client';

import JSZip from 'jszip';
import { Check, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  ACCEPT_ATTRIBUTE,
  type CompressFileMeta,
  CompressManifest,
  DEFAULT_QUALITY,
  detectCompressibleMagic,
  ERROR_NOT_IMAGE,
  ERROR_TOO_MANY_FILES,
  MAX_COMPRESS_BYTES,
  MAX_COMPRESS_FILES,
  MAX_FILENAME_LEN,
  MIN_QUALITY,
} from '@/lib/contracts/image-compress';
import { useLocalHistory } from '@/lib/hooks/use-local-history';
import { getImageWorker, isImageWorkerSupported } from '@/lib/workers/image-compress-pool';
import type { IncomingMessage, OutgoingMessage } from '@/workers/image-compress.worker';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PickedFile {
  file: File;
  invalid: string | null;
}

interface ServerPlainError {
  error?: string;
}

async function submitToServer(
  validFiles: PickedFile[],
  quality: number,
): Promise<
  | { ok: true; blob: Blob; filename: string; files: CompressFileMeta[] | null }
  | { ok: false; message: string }
> {
  const form = new FormData();
  for (const p of validFiles) form.append('files', p.file, p.file.name);
  form.append('quality', String(quality));
  const res = await fetch('/api/image/compress', { method: 'POST', body: form, cache: 'no-store' });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // fall through
    }
    const plain = (body as ServerPlainError | null)?.error ?? `Error ${res.status}`;
    return { ok: false, message: plain };
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = `imagenes-comprimidas-${Date.now()}.zip`;
  const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  let parsed: CompressFileMeta[] | null = null;
  try {
    const zip = await JSZip.loadAsync(blob);
    const manifestEntry = zip.file('manifest.json');
    if (manifestEntry) {
      const txt = await manifestEntry.async('string');
      const safe = CompressManifest.safeParse(JSON.parse(txt));
      if (safe.success) parsed = safe.data.files;
    }
  } catch {
    // ZIP parse failed — we still have the download; results stay optional.
  }
  return { ok: true, blob, filename, files: parsed };
}

function recordHistoryAndDownload(
  history: ReturnType<typeof useLocalHistory>,
  validCount: number,
  quality: number,
  blob: Blob,
  filename: string,
  parsedFiles: CompressFileMeta[] | null,
): void {
  history.add({
    id: crypto.randomUUID(),
    inputName: `${validCount} ${validCount === 1 ? 'imagen' : 'imágenes'}`,
    outputName: filename,
    outputSizeBytes: parsedFiles?.reduce((acc, r) => acc + r.compressedSize, 0) ?? blob.size,
    outputFormat: 'ZIP',
    kind: 'comprimir-imagenes',
  });
  triggerDownload(blob, filename);
  toast.success('Imágenes comprimidas — descarga iniciada', {
    description: `Calidad ${quality}, ${validCount} ${validCount === 1 ? 'archivo' : 'archivos'} en ${filename}`,
  });
}

function estimatedSavingsPct(quality: number): number {
  const q = Math.min(100, Math.max(1, quality));
  // Coarse JPEG-centric heuristic — only an estimate. Lower quality -> more savings.
  const pct = Math.round(45 - (q - 1) * 0.35);
  return Math.max(-5, Math.min(60, pct));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

// Mirrors the server's `pctSaved` — single source for the table column so
// worker-compressed batches show the same savings number the server route
// would have produced for the same input.
function pctSaved(originalBytes: number, compressedBytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.round(((originalBytes - compressedBytes) / originalBytes) * 1000) / 10;
}

interface WebpWorkerChunk {
  filename: string;
  originalBytes: Uint8Array;
  compressedBlob: Blob;
}

interface UseImageWorker {
  compressWebpBatch(
    files: Array<{ name: string; bytes: ArrayBuffer }>,
    quality: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<WebpWorkerChunk[]>;
  isReady: boolean;
}

function useImageWorker(): UseImageWorker {
  // Lazy on first compress call — the pool's singleton handles the
  // module-worker reference; the hook owns protocol state (pending map).
  const pendingRef = useRef<
    Map<
      string,
      {
        resolve: (chunks: WebpWorkerChunk[]) => void;
        reject: (err: Error) => void;
        chunks: WebpWorkerChunk[];
        remaining: number;
        sawError: boolean;
        onProgress?: (done: number, total: number) => void;
      }
    >
  >(new Map());

  const compressWebpBatch = useCallback(
    (
      files: Array<{ name: string; bytes: ArrayBuffer }>,
      quality: number,
      onProgress?: (done: number, total: number) => void,
    ): Promise<WebpWorkerChunk[]> => {
      const w = getImageWorker();
      if (!w) {
        return Promise.reject(new Error('worker_unsupported'));
      }
      const jobId = crypto.randomUUID();
      return new Promise<WebpWorkerChunk[]>((resolve, reject) => {
        pendingRef.current.set(jobId, {
          resolve,
          reject,
          chunks: [],
          remaining: files.length,
          sawError: false,
          onProgress,
        });
        const msg: IncomingMessage = {
          type: 'compress',
          jobId,
          quality,
          files,
        };
        w.postMessage(
          msg,
          files.map((f) => f.bytes),
        );
      });
    },
    [],
  );

  // Subscribe ONCE on mount to forward worker events to the pending map.
  // The effect intentionally depends on nothing because the worker
  // instance is module-pool-singleton; re-binding on every render would
  // be wasted work and would lose pending promises.
  useEffect(() => {
    const w = getImageWorker();
    if (!w) return undefined;

    const handler = (e: MessageEvent<OutgoingMessage>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        const entry = pendingRef.current.get(msg.jobId);
        if (entry) entry.onProgress?.(0, entry.remaining);
        return;
      }
      if (msg.type === 'chunk') {
        const entry = pendingRef.current.get(msg.jobId);
        if (!entry) return;
        entry.chunks.push({
          filename: msg.filename,
          originalBytes: new Uint8Array(msg.originalBytes),
          compressedBlob: msg.blob,
        });
        entry.onProgress?.(entry.chunks.length, entry.remaining);
        return;
      }
      if (msg.type === 'error') {
        const entry = pendingRef.current.get(msg.jobId);
        if (!entry) return;
        if (!entry.sawError) {
          entry.sawError = true;
          entry.reject(new Error(msg.code));
          pendingRef.current.delete(msg.jobId);
        }
        return;
      }
      if (msg.type === 'done') {
        const entry = pendingRef.current.get(msg.jobId);
        if (!entry) return;
        if (entry.sawError) return;
        // The worker sends one `done` after all per-file chunk/error events.
        pendingRef.current.delete(msg.jobId);
        entry.onProgress?.(entry.remaining, entry.remaining);
        entry.resolve(entry.chunks);
      }
    };

    w.addEventListener('message', handler);
    return () => w.removeEventListener('message', handler);
  }, []);

  return {
    compressWebpBatch,
    isReady: isImageWorkerSupported,
  };
}

export function ImageCompressClient() {
  const history = useLocalHistory('comprimir-imagenes');
  const { compressWebpBatch, isReady: workerReady } = useImageWorker();
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [quality, setQuality] = useState<number>(DEFAULT_QUALITY);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<CompressFileMeta[] | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validCount = picked.filter((p) => p.invalid === null).length;
  const hasInvalid = picked.some((p) => p.invalid !== null);

  const estimated = useMemo(() => estimatedSavingsPct(quality), [quality]);

  const validateFile = useCallback(async (file: File): Promise<string | null> => {
    if (file.name.length > MAX_FILENAME_LEN) return 'Nombre demasiado largo';
    if (file.size > MAX_COMPRESS_BYTES) {
      return `Supera ${(MAX_COMPRESS_BYTES / (1024 * 1024)).toFixed(0)} MB`;
    }
    const head = file.slice(0, 16);
    const detected = detectCompressibleMagic(new Uint8Array(await head.arrayBuffer()));
    if (!detected) return ERROR_NOT_IMAGE(file.name, 'JPG, PNG ni WebP');
    return null;
  }, []);

  const onPick = useCallback(
    async (incoming: File[]) => {
      setErrorMsg(null);
      setResults(null);
      if (incoming.length === 0) return;
      // Reuse the underlying File from each existing PickedFile plus the new
      // bare Files, so the resulting array is uniformly `File[]`.
      const existingFiles = picked.map((p) => p.file);
      const merged: File[] = [...existingFiles, ...incoming];
      if (merged.length > MAX_COMPRESS_FILES) {
        setErrorMsg(ERROR_TOO_MANY_FILES);
        return;
      }
      const annotated: PickedFile[] = await Promise.all(
        merged.map(async (f) => ({
          file: f,
          invalid: await validateFile(f),
        })),
      );
      setPicked(annotated);
    },
    [picked, validateFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      if (isCompressing) return;
      e.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) void onPick(dropped);
    },
    [isCompressing, onPick],
  );

  const removeAt = useCallback((idx: number) => {
    setErrorMsg(null);
    setResults(null);
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const resetAll = useCallback(() => {
    setPicked([]);
    setResults(null);
    setErrorMsg(null);
    setProgressPct(0);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const onSubmit = useCallback(async () => {
    if (picked.length === 0 || validCount === 0) return;
    setErrorMsg(null);
    setIsCompressing(true);
    setProgressPct(8);
    setResults(null);
    const validFiles = picked.filter((p) => p.invalid === null);

    // Decide path: WebP-only batches can run on the worker when the browser
    // exposes OffscreenCanvas. Re-detect on the first bytes (the picker
    // accept attribute is best-effort) so a mislabeled file can't silently
    // slip past the speedup. ANY non-WebP file in the batch falls back to
    // the server route — splitting per-file would produce a non-deterministic
    // two-pipeline ZIP.
    let useWorker = workerReady;
    if (useWorker) {
      try {
        for (const p of validFiles) {
          const head = new Uint8Array(await p.file.slice(0, 16).arrayBuffer());
          if (detectCompressibleMagic(head) !== 'webp') {
            useWorker = false;
            break;
          }
        }
      } catch {
        useWorker = false;
      }
    }

    try {
      if (useWorker) {
        // Worker path: decode + re-encode off-thread, then assemble a ZIP on
        // the main thread that mirrors the server route's `manifest.json`
        // shape so the existing parse block below can populate the table.
        const payloads = await Promise.all(
          validFiles.map(async (p) => ({
            name: p.file.name,
            bytes: await p.file.arrayBuffer(),
          })),
        );

        const chunks = await compressWebpBatch(payloads, quality, (done, total) => {
          // Map (done/total) into the existing progress bar: 8 -> 95 %
          // across the worker loop. We anchor the start at 8 + (87 * done/total).
          const pct = total > 0 ? 8 + Math.round((87 * done) / total) : 60;
          setProgressPct(Math.min(95, pct));
        });

        const zip = new JSZip();
        const fileMetas: CompressFileMeta[] = [];
        let totalIn = 0;
        let totalOut = 0;
        const usedNames = new Map<string, number>();
        const stripExt = (name: string): string =>
          (name.replace(/\.(jpe?g|png|webp)$/i, '').trim() || 'imagen')
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .slice(0, 120) || 'imagen';

        for (const c of chunks) {
          let entryName = `${stripExt(c.filename)}.webp`;
          const collisions = usedNames.get(entryName) ?? 0;
          if (collisions > 0) entryName = `${stripExt(c.filename)}-${collisions + 1}.webp`;
          usedNames.set(`${stripExt(c.filename)}.webp`, collisions + 1);

          const compressedBytes = new Uint8Array(await c.compressedBlob.arrayBuffer());
          zip.file(entryName, compressedBytes);
          totalIn += c.originalBytes.byteLength;
          totalOut += compressedBytes.byteLength;
          fileMetas.push({
            filename: entryName,
            originalSize: c.originalBytes.byteLength,
            compressedSize: compressedBytes.byteLength,
            savingsPct: pctSaved(c.originalBytes.byteLength, compressedBytes.byteLength),
          });
        }

        const totals = {
          generatedAt: new Date().toISOString(),
          quality,
          totalIn,
          totalOut,
          savingsPct: pctSaved(totalIn, totalOut),
          files: fileMetas,
        };
        zip.file('manifest.json', JSON.stringify(totals, null, 2));
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        const blob = new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' });
        const filename = `imagenes-comprimidas-${Date.now()}.zip`;

        setProgressPct(100);
        setResults(fileMetas);
        recordHistoryAndDownload(history, validCount, quality, blob, filename, fileMetas);
        return;
      }

      // Server route is the fallback for any batch that isn't WebP-only.
      setProgressPct(40);
      const result = await submitToServer(validFiles, quality);
      if (!result.ok) {
        toast.error(result.message);
        setErrorMsg(result.message);
        return;
      }

      setProgressPct(100);
      setResults(result.files);
      recordHistoryAndDownload(
        history,
        validCount,
        quality,
        result.blob,
        result.filename,
        result.files,
      );
    } catch (err) {
      // Worker fallback when the pool rejected (worker_unsupported,
      // not_webp_slice_yet, decode_failed, encode_failed) — degrade gracefully
      // to the server route so the UX stays the same even when the worker
      // doesn't handle this slice.
      if (
        err instanceof Error &&
        (err.message === 'worker_unsupported' ||
          err.message === 'not_webp_slice_yet' ||
          err.message === 'decode_failed' ||
          err.message === 'encode_failed')
      ) {
        try {
          setProgressPct(40);
          const result = await submitToServer(validFiles, quality);
          if (!result.ok) {
            toast.error(result.message);
            setErrorMsg(result.message);
            return;
          }
          setResults(result.files);
          recordHistoryAndDownload(
            history,
            validCount,
            quality,
            result.blob,
            result.filename,
            result.files,
          );
          return;
        } catch {
          toast.error('No se pudo conectar al servidor');
        }
      } else if (err instanceof Error) {
        toast.error('No se pudo conectar al servidor');
      } else {
        toast.error('No se pudo conectar al servidor');
      }
    } finally {
      setIsCompressing(false);
      setProgressPct(0);
    }
  }, [picked, quality, validCount, history, workerReady, compressWebpBatch]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-3 text-center">
        <Badge
          variant="outline"
          className="mx-auto text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
        >
          Privacidad total · Hasta 20 imágenes en un solo ZIP
        </Badge>
        <h1 className="font-display text-h1 font-bold tracking-tight text-foreground">
          Comprimir imágenes
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Sube hasta 20 imágenes{' '}
          <span className="font-medium text-foreground">JPG, PNG o WebP</span> (máx. 10 MB cada
          una), elige la calidad y descarga todas las versiones comprimidas en un único ZIP con
          tabla de ahorro.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Las imágenes se procesan en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guardan en disco</span>.
          Dimensiones originales preservadas — solo cambia el peso.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Tus imágenes</CardTitle>
          <CardDescription>
            Arrastra varios archivos a la vez o haz clic para seleccionarlos. Formatos aceptados:
            JPG, PNG y WebP.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <label
            htmlFor="compress-files"
            onDragOver={(e) => {
              if (isCompressing) return;
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragOver
                ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20'
                : 'border-brand-300/70 bg-brand-50/30 hover:border-brand-500 hover:bg-brand-50/60 dark:bg-brand-900/10 dark:hover:bg-brand-900/20'
            } ${isCompressing ? 'pointer-events-none opacity-60' : ''}`}
          >
            <Upload className="h-7 w-7 text-brand-500" aria-hidden />
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              Arrastra tus imágenes aquí
            </span>
            <span className="text-xs text-muted-foreground">
              o haz clic para seleccionar — máx. {MAX_COMPRESS_FILES} archivos,{' '}
              {(MAX_COMPRESS_BYTES / (1024 * 1024)).toFixed(0)} MB c/u (JPG, PNG o WebP)
            </span>
            <Input
              id="compress-files"
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length > 0) void onPick(list);
                e.target.value = '';
              }}
            />
          </label>

          {picked.length > 0 && (
            <ul className="flex flex-col gap-2">
              {picked.map((p, idx) => (
                <li
                  // Stable key: name + size + lastModified keeps identity across re-renders.
                  key={`${p.file.name}-${p.file.size}-${p.file.lastModified}-${idx}`}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                    p.invalid
                      ? 'border-destructive/40 bg-destructive/5'
                      : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{p.file.name}</span>
                    <span className="text-xs text-muted-foreground">{humanSize(p.file.size)}</span>
                    {p.invalid && (
                      <span className="mt-1 text-xs font-medium text-destructive">{p.invalid}</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isCompressing}
                    onClick={() => removeAt(idx)}
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Calidad de salida</span>
              <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">
                {quality}
              </span>
            </div>
            <Slider
              value={[quality]}
              min={MIN_QUALITY}
              max={100}
              step={1}
              onValueChange={(v) => setQuality(v[0] ?? DEFAULT_QUALITY)}
              disabled={isCompressing}
              aria-label="Calidad de compresión"
            />
            <p className="text-xs text-muted-foreground">
              Ahorro estimado (referencia):{' '}
              <span className="font-semibold text-foreground">~−{estimated} %</span> — menor calidad
              comprime más. Estimación orientativa, el resultado real depende de cada imagen.
            </p>
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {errorMsg}
            </p>
          )}

          {isCompressing && (
            <output className="flex flex-col gap-2">
              <Progress
                value={progressPct}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {progressPct < 60 ? 'Subiendo imágenes…' : 'Comprimiendo en el servidor…'}
              </p>
            </output>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              size="lg"
              disabled={picked.length === 0 || validCount === 0 || hasInvalid || isCompressing}
              aria-busy={isCompressing}
              onClick={() => void onSubmit()}
              className="gap-2 text-base font-semibold"
            >
              {isCompressing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Comprimiendo…
                </>
              ) : (
                <>
                  Comprimir {validCount > 0 ? `${validCount} ` : ''}imagen
                  {validCount === 1 ? '' : 'es'}
                </>
              )}
            </Button>
            {(picked.length > 0 || results !== null) && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={isCompressing}
                onClick={resetAll}
              >
                Empezar de nuevo
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Privacidad total: nada se guarda en disco. Salida en ZIP sin marca de agua.
          </p>
        </CardContent>
      </Card>

      {results && results.length > 0 && (
        <Card className="border-border/60 bg-card/80 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-brand-600" aria-hidden />
              Resumen de la última compresión
            </CardTitle>
            <CardDescription>
              Antes vs. después para cada imagen de la última petición.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Archivo</th>
                    <th className="px-3 py-2 text-right font-medium">Antes</th>
                    <th className="px-3 py-2 text-right font-medium">Después</th>
                    <th className="px-3 py-2 text-right font-medium">Ahorro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {results.map((r) => (
                    <tr key={r.filename}>
                      <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-foreground">
                        {r.filename}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {humanSize(r.originalSize)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {humanSize(r.compressedSize)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          −{r.savingsPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <X className="h-3 w-3" aria-hidden />
              Los datos de esta tabla vienen del manifest.json dentro del ZIP descargado.
            </p>
          </CardContent>
        </Card>
      )}

      <RecentResultsStrip slug="comprimir-imagenes" className="w-full" />
    </main>
  );
}
