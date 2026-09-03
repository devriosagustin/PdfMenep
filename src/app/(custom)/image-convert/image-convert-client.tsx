'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadNameFor, filenameFromContentDisposition } from '@/lib/business/image-format';
import {
  ACCEPT_ATTRIBUTE,
  CONTENT_TYPES,
  detectImageMagic,
  type ImageTargetFormat,
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
  TARGET_LABELS,
  TARGET_OPTIONS,
} from '@/lib/contracts/image-convert';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SubmitOk {
  ok: true;
  blob: Blob;
  filename: string;
}
interface SubmitErr {
  ok: false;
  fieldMessage: string | null;
  toastMessage: string;
}

async function submitForConvert(
  file: File,
  target: ImageTargetFormat,
  onPhaseChange: (phase: 'uploading' | 'converting') => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('target', target);

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/image/convert', {
      method: 'POST',
      body: form,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, fieldMessage: null, toastMessage: 'No se pudo conectar al servidor' };
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // fall through
    }
    const fieldErrors = (body as ServerFieldErrors | null)?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const fileMsg = fieldErrors.file;
      if (fileMsg) {
        return { ok: false, fieldMessage: fileMsg, toastMessage: fileMsg };
      }
      const firstValue = Object.values(fieldErrors)[0];
      if (firstValue) {
        return { ok: false, fieldMessage: firstValue, toastMessage: firstValue };
      }
    }
    const plain = (body as ServerPlainError | null)?.error;
    return {
      ok: false,
      fieldMessage: null,
      toastMessage: plain ?? `Error ${res.status}`,
    };
  }

  onPhaseChange('converting');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameFor(file.name, target);
  const filename = filenameFromContentDisposition(cd, fallbackName);
  return { ok: true, blob, filename };
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
  // Defer revoke so the download has time to start (Safari needs this).
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function ImageConvertClient() {
  const history = useLocalHistory('image-convert');
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<ImageTargetFormat>('jpeg');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'converting'>('idle');
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = useCallback(async (next: File | null) => {
    setErrorMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setErrorMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setErrorMsg(`El archivo supera ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB`);
      setFile(null);
      return;
    }
    const head = next.slice(0, 16);
    const headBuf = new Uint8Array(await head.arrayBuffer());
    const detected = detectImageMagic(headBuf);
    if (!detected) {
      setErrorMsg('El archivo no es una imagen válida (JPG, PNG, WebP o GIF)');
      setFile(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      if (isConverting) return;
      e.preventDefault();
      setIsDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) void onPick(dropped);
    },
    [isConverting, onPick],
  );

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setErrorMsg(null);
    setIsConverting(true);
    setPhase('uploading');
    try {
      const result = await submitForConvert(file, target, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.blob.size,
          outputFormat: TARGET_LABELS[target],
          kind: 'image-convert',
        });
        toast.success(`Imagen convertida: ${result.filename}`, {
          description: `Formato de salida: ${CONTENT_TYPES[target]}. La descarga ha comenzado.`,
        });
      } else {
        if (result.fieldMessage) setErrorMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setIsConverting(false);
      setPhase('idle');
    }
  }, [file, target, history.add]);

  const targetLabel = TARGET_LABELS[target];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-3 text-center">
        <Badge
          variant="outline"
          className="mx-auto text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
        >
          Privacidad total · Procesamiento 100% local
        </Badge>
        <h1 className="font-display text-h1 font-bold tracking-tight text-foreground">
          Conversor de imágenes
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Convierte entre <span className="font-medium text-foreground">JPG, PNG, WebP y GIF</span>{' '}
          arrastrando una imagen y eligiendo el formato de salida. Si subes un GIF animado, solo se
          conservará el primer fotograma.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu imagen se procesa en el servidor y no se guarda en disco. Tamaño máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          . <span className="font-medium text-foreground">Nota:</span> los GIFs animados solo
          conservarán el primer fotograma tras la conversión.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir imagen</CardTitle>
          <CardDescription>
            Arrastra una imagen o haz clic para seleccionarla. Elige el formato de destino y pulsa
            “Convertir”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <label
            htmlFor="image-file"
            onDragOver={(e) => {
              if (isConverting) return;
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragOver
                ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20'
                : 'border-brand-300/70 bg-brand-50/30 hover:border-brand-500 hover:bg-brand-50/60 dark:bg-brand-900/10 dark:hover:bg-brand-900/20'
            }`}
          >
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {file ? 'Cambiar archivo' : 'Arrastra tu imagen aquí'}
            </span>
            <span className="text-xs text-muted-foreground">
              o haz clic para seleccionar — máx. {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB
              (JPG, PNG, WebP o GIF)
            </span>
            <Input
              id="image-file"
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                void onPick(picked);
                e.target.value = '';
              }}
            />
          </label>

          {file && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{file.name}</span>
                <span className="text-xs text-muted-foreground">{humanSize(file.size)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isConverting}
                onClick={() => {
                  setFile(null);
                  setErrorMsg(null);
                }}
              >
                Quitar
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Formato de destino
            </span>
            <Tabs
              value={target}
              onValueChange={(v) => setTarget(v as ImageTargetFormat)}
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-4 bg-muted/60 p-1">
                {TARGET_OPTIONS.map((fmt) => (
                  <TabsTrigger
                    key={fmt}
                    value={fmt}
                    disabled={isConverting}
                    className="flex flex-col gap-0.5 py-2 data-[state=active]:bg-background data-[state=active]:text-brand-700 data-[state=active]:shadow-sm dark:data-[state=active]:text-brand-300"
                  >
                    <span className="text-sm font-semibold">{TARGET_LABELS[fmt]}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      .{fmt === 'jpeg' ? 'jpg' : fmt}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {errorMsg}
            </p>
          )}

          {isConverting && (
            <output className="flex flex-col gap-2">
              <Progress
                value={phase === 'uploading' ? 45 : 90}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {phase === 'uploading'
                  ? `Subiendo imagen…`
                  : `Convirtiendo a ${targetLabel} en el servidor…`}
              </p>
            </output>
          )}

          <Button
            type="button"
            size="lg"
            disabled={!file || isConverting}
            aria-busy={isConverting}
            onClick={() => void onSubmit()}
            className="gap-2 text-base font-semibold"
          >
            {isConverting ? 'Convirtiendo…' : `Convertir a ${targetLabel}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Soportamos JPG, PNG, WebP y GIF de hasta {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}{' '}
            MB. La conversión se realiza en el servidor y el archivo no se guarda.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="image-convert" className="w-full" />
    </main>
  );
}
