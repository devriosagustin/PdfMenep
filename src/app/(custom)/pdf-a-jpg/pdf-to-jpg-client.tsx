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
import { downloadNameFor, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import { MAX_FILENAME_LEN, MAX_UPLOAD_BYTES, PDF_MAGIC } from '@/lib/contracts/pdf-convert';
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
  const slice = file.slice(0, PDF_MAGIC.length);
  const buf = new Uint8Array(await slice.arrayBuffer());
  if (buf.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buf[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
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
  file: File,
  onPhaseChange: (phase: 'uploading' | 'converting') => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/convert', {
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
      // fall through to generic message
    }
    const fieldErrors = (body as ServerFieldErrors | null)?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const fileMsg = fieldErrors.file;
      if (fileMsg) {
        return { ok: false, fieldMessage: fileMsg, toastMessage: fileMsg };
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
  const fallbackName = downloadNameFor(file.name, res.headers.get('content-type') ?? 'image/jpeg');
  const filename = filenameFromContentDisposition(cd, fallbackName);
  const pagesHeader = res.headers.get('x-pages');
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
  // Defer revoke so the download has time to start (Safari needs this).
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function PdfToJpgClient() {
  const history = useLocalHistory('pdf-a-jpg');
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'converting'>('idle');
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
    const valid = await readMagic(next);
    if (!valid) {
      setErrorMsg('El archivo no es un PDF válido');
      setFile(null);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setErrorMsg(null);
    setIsConverting(true);
    setPhase('uploading');
    try {
      const result = await submitForConvert(file, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.blob.size,
          outputFormat: result.pages !== null && result.pages > 1 ? 'ZIP' : 'JPG',
          kind: 'pdf-a-jpg',
        });
        const pageNote =
          result.pages !== null
            ? result.pages > 1
              ? ` (${result.pages} páginas en ZIP)`
              : ''
            : '';
        toast.success(`Archivo convertido${pageNote}: ${result.filename}`, {
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
  }, [file, history.add]);

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
          Conversor PDF a JPG
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Sube un PDF y descarga una imagen JPG por página. Si tu PDF tiene una página, recibirás un
          único JPG; si tiene varias, un ZIP con{' '}
          <span className="font-medium text-foreground">page-001.jpg</span>,{' '}
          <span className="font-medium text-foreground">page-002.jpg</span>…
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tus archivos se procesan en el servidor y no se guardan en disco. El tamaño máximo es{' '}
          <span className="font-medium text-foreground">
            {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>{' '}
          y hasta <span className="font-medium text-foreground">30 páginas</span>.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Selecciona un archivo PDF de tu dispositivo. La conversión ocurre al pulsar “Convertir”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <label
            htmlFor="pdf-file"
            onDragOver={(e) => {
              if (isConverting) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (isConverting) return;
              e.preventDefault();
              const dropped = e.dataTransfer.files[0];
              if (dropped) onPick(dropped);
            }}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-brand-300/70 bg-brand-50/30 px-6 py-10 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/60 dark:bg-brand-900/10 dark:hover:bg-brand-900/20"
          >
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {file ? 'Cambiar archivo' : 'Arrastra tu PDF aquí'}
            </span>
            <span className="text-xs text-muted-foreground">
              o haz clic para seleccionar — máx. {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="pdf-file"
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
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
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Convirtiendo páginas en el servidor…'}
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
            {isConverting ? 'Convirtiendo…' : 'Convertir a JPG'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Soportamos PDFs sin contraseña, de hasta {(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}{' '}
            MB y 30 páginas.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="pdf-a-jpg" className="w-full" />
    </main>
  );
}
