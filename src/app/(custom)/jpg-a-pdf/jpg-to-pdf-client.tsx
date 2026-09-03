'use client';

import { ArrowDown, ArrowUp, FileImage, Image as ImageIcon, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { downloadNameForJpg, filenameFromContentDisposition } from '@/lib/business/jpg-format';
import {
  JPEG_MAGIC,
  MAX_FILENAME_LEN,
  MAX_IMAGES,
  MAX_PER_FILE_BYTES,
  MAX_TOTAL_BYTES,
} from '@/lib/contracts/jpg-convert';
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

async function readMagic(file: File): Promise<boolean> {
  if (file.size < JPEG_MAGIC.length) return false;
  const slice = file.slice(0, JPEG_MAGIC.length);
  const buf = new Uint8Array(await slice.arrayBuffer());
  for (let i = 0; i < JPEG_MAGIC.length; i++) {
    if (buf[i] !== JPEG_MAGIC[i]) return false;
  }
  return true;
}

interface PickedFile {
  id: string;
  file: File;
}

interface SubmitOk {
  ok: true;
  blob: Blob;
  filename: string;
  pages: number | null;
}
interface SubmitErr {
  ok: false;
  fieldMessage: string | null;
  toastMessage: string;
}

async function submitForConvert(
  items: PickedFile[],
  onPhaseChange: (phase: 'uploading' | 'converting') => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  for (const item of items) {
    form.append('files', item.file, item.file.name);
  }

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/jpg/convert', {
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
      const filesMsg = fieldErrors.files;
      if (filesMsg) {
        return { ok: false, fieldMessage: filesMsg, toastMessage: filesMsg };
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
  const fallbackName = downloadNameForJpg(items[0]?.file.name ?? 'imagen.jpg', 'application/pdf');
  const filename = filenameFromContentDisposition(cd, fallbackName);
  const pagesHeader = res.headers.get('x-images');
  const pages = pagesHeader ? Number(pagesHeader) : null;
  return { ok: true, blob, filename, pages: Number.isFinite(pages) ? pages : null };
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

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface ValidateOk {
  ok: true;
  items: PickedFile[];
}
interface ValidateErr {
  ok: false;
  message: string;
}

async function validateAndAdopt(
  candidates: File[],
  existing: PickedFile[],
): Promise<ValidateOk | ValidateErr> {
  const entries: PickedFile[] = [];
  let total = existing.reduce((acc, f) => acc + f.file.size, 0);
  for (const file of candidates) {
    if (entries.length + existing.length >= MAX_IMAGES) {
      return { ok: false, message: `Máximo ${MAX_IMAGES} imágenes` };
    }
    if (file.name.length > MAX_FILENAME_LEN) {
      return { ok: false, message: `El nombre de "${file.name}" es demasiado largo` };
    }
    if (file.size > MAX_PER_FILE_BYTES) {
      return {
        ok: false,
        message: `"${file.name}" supera ${(MAX_PER_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB`,
      };
    }
    total += file.size;
    if (total > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        message: `El total supera ${(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB`,
      };
    }
    const valid = await readMagic(file);
    if (!valid) {
      return { ok: false, message: `"${file.name}" no es un JPG válido` };
    }
    entries.push({ id: makeId(), file });
  }
  return { ok: true, items: entries };
}

export function JpgToPdfClient() {
  const history = useLocalHistory('jpg-a-pdf');
  const [items, setItems] = useState<PickedFile[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'converting'>('idle');
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (isConverting) return;
      setErrorMsg(null);
      if (incoming.length === 0) return;
      const result = await validateAndAdopt(incoming, items);
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setItems((prev) => [...prev, ...result.items]);
    },
    [items, isConverting],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      if (isConverting) return;
      e.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files);
      void addFiles(dropped);
    },
    [addFiles, isConverting],
  );

  const removeAt = useCallback(
    (id: string) => {
      if (isConverting) return;
      setErrorMsg(null);
      setItems((prev) => prev.filter((p) => p.id !== id));
    },
    [isConverting],
  );

  const moveAt = useCallback(
    (id: string, dir: -1 | 1) => {
      if (isConverting) return;
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === id);
        if (idx < 0) return prev;
        const target = idx + dir;
        if (target < 0 || target >= prev.length) return prev;
        const next = prev.slice();
        const [item] = next.splice(idx, 1);
        if (!item) return prev;
        next.splice(target, 0, item);
        return next;
      });
    },
    [isConverting],
  );

  const clearAll = useCallback(() => {
    if (isConverting) return;
    setItems([]);
    setErrorMsg(null);
  }, [isConverting]);

  const onSubmit = useCallback(async () => {
    if (items.length === 0) return;
    setErrorMsg(null);
    setIsConverting(true);
    setPhase('uploading');
    try {
      const result = await submitForConvert(items, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        history.add({
          id: makeId(),
          inputName:
            items.length === 1 ? (items[0]?.file.name ?? 'imagen.jpg') : `${items.length} imágenes`,
          outputName: result.filename,
          outputSizeBytes: result.blob.size,
          outputFormat: 'PDF',
          kind: 'jpg-a-pdf',
        });
        const note =
          result.pages !== null
            ? ` (${result.pages} ${result.pages === 1 ? 'página' : 'páginas'})`
            : '';
        toast.success(`PDF generado${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
      } else {
        if (result.fieldMessage) setErrorMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setIsConverting(false);
      setPhase('idle');
    }
  }, [items, history.add]);

  const totalBytes = items.reduce((acc, i) => acc + i.file.size, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-3 text-center">
        <Badge
          variant="outline"
          className="mx-auto text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
        >
          Privacidad total · Procesamiento 100% local
        </Badge>
        <h1 className="font-display text-h1 font-bold tracking-tight text-foreground">
          Conversor JPG a PDF
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Sube hasta <span className="font-medium text-foreground">{MAX_IMAGES} imágenes JPG</span>{' '}
          y descarga un PDF con una imagen por página. Reordénalas con las flechas antes de
          convertir.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tus imágenes se procesan en el servidor y no se guardan en disco. Tamaño por imagen:{' '}
          <span className="font-medium text-foreground">
            {(MAX_PER_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , total:{' '}
          <span className="font-medium text-foreground">
            {(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , máximo <span className="font-medium text-foreground">{MAX_IMAGES} imágenes</span>.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir JPGs</CardTitle>
          <CardDescription>
            Arrastra varias imágenes o haz clic para seleccionarlas. La conversión ocurre al pulsar
            “Convertir a PDF”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <label
            htmlFor="jpg-files"
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
            <FileImage className="h-8 w-8 text-brand-500" aria-hidden="true" />
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {items.length === 0 ? 'Arrastra tus JPGs aquí' : 'Añadir más imágenes'}
            </span>
            <span className="text-xs text-muted-foreground">
              o haz clic para seleccionar — máx. {MAX_IMAGES} imágenes,{' '}
              {(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB en total
            </span>
            <Input
              id="jpg-files"
              ref={inputRef}
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                void addFiles(picked);
                e.target.value = '';
              }}
            />
          </label>

          {items.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {items.length} {items.length === 1 ? 'imagen' : 'imágenes'} ·{' '}
                  {humanSize(totalBytes)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isConverting}
                  onClick={clearAll}
                >
                  Quitar todas
                </Button>
              </div>

              <ul className="flex flex-col gap-2">
                {items.map((item, idx) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {idx + 1}
                    </span>
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background"
                      aria-hidden="true"
                    >
                      <ImageIcon className="h-5 w-5 text-brand-500" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {item.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {humanSize(item.file.size)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isConverting || idx === 0}
                        onClick={() => moveAt(item.id, -1)}
                        aria-label={`Mover "${item.file.name}" arriba`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isConverting || idx === items.length - 1}
                        onClick={() => moveAt(item.id, 1)}
                        aria-label={`Mover "${item.file.name}" abajo`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isConverting}
                        onClick={() => removeAt(item.id)}
                        aria-label={`Quitar "${item.file.name}"`}
                      >
                        <X className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                {phase === 'uploading' ? 'Subiendo imágenes…' : 'Ensamblando PDF en el servidor…'}
              </p>
            </output>
          )}

          <Button
            type="button"
            size="lg"
            disabled={items.length === 0 || isConverting}
            aria-busy={isConverting}
            onClick={() => void onSubmit()}
            className="gap-2 text-base font-semibold"
          >
            {isConverting ? 'Convirtiendo…' : 'Convertir a PDF'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Una imagen por página, en el orden de la lista. Ideal para álbumes, portafolios o
            documentación rápida.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="jpg-a-pdf" className="w-full" />
    </main>
  );
}
