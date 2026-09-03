'use client';

import { FileDown, FileText, Trash2, Upload as UploadIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { downloadNameForSplit, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_PDF_BYTES,
  PDF_MAGIC,
  parseErrorMessage,
  parsePageSelectionString,
} from '@/lib/contracts/pdf-split';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'splitting';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readMagic(file: File): Promise<boolean> {
  if (file.size < PDF_MAGIC.length) return false;
  const slice = file.slice(0, PDF_MAGIC.length);
  const buf = new Uint8Array(await slice.arrayBuffer());
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buf[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function triggerDownload(blob: Blob, filename: string): void {
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
  pagesHeader: number | null;
}

async function submitForSplit(
  file: File,
  pagesInput: string,
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  const trimmed = pagesInput.trim();
  if (trimmed.length === 0) {
    form.append('mode', 'all');
  } else {
    form.append('mode', 'pages');
    form.append('pagesRaw', pagesInput);
  }

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/split', {
      method: 'POST',
      body: form,
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      fieldMessage: null,
      toastMessage: 'No se pudo conectar al servidor',
      pagesHeader: null,
    };
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
        return {
          ok: false,
          fieldMessage: fileMsg,
          toastMessage: fileMsg,
          pagesHeader: null,
        };
      }
      const firstValue = Object.values(fieldErrors)[0];
      if (firstValue) {
        return {
          ok: false,
          fieldMessage: firstValue,
          toastMessage: firstValue,
          pagesHeader: null,
        };
      }
    }
    const plain = (body as ServerPlainError | null)?.error;
    return {
      ok: false,
      fieldMessage: null,
      toastMessage: plain ?? `Error ${res.status}`,
      pagesHeader: null,
    };
  }

  onPhaseChange('splitting');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForSplit(file.name);
  const filename = filenameFromContentDisposition(cd, fallbackName);
  const pagesHeader = res.headers.get('x-pages');
  const pages = pagesHeader ? Number(pagesHeader) : null;
  return { ok: true, blob, filename, pages: Number.isFinite(pages) ? pages : null };
}

export function DividirPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesInput, setPagesInput] = useState('');
  const [parsedPreview, setParsedPreview] = useState<number[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [totalPagesHint, setTotalPagesHint] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const history = useLocalHistory('dividir-pdf');

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setPagesInput('');
    setParsedPreview(null);
    setPreviewError(null);
    setTotalPagesHint(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_PDF_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_PDF_BYTES / (1024 * 1024)).toFixed(0)} MB`);
      setFile(null);
      return;
    }
    const valid = await readMagic(next);
    if (!valid) {
      setFieldMsg('El archivo no es un PDF válido');
      setFile(null);
      return;
    }
  }, []);

  const onRemoveFile = useCallback(() => {
    setFile(null);
    setPagesInput('');
    setParsedPreview(null);
    setPreviewError(null);
    setTotalPagesHint(null);
    setFieldMsg(null);
  }, []);

  const onPagesChange = useCallback((text: string) => {
    setPagesInput(text);
    if (text.trim().length === 0) {
      setParsedPreview(null);
      setPreviewError(null);
      return;
    }
    const parsed = parsePageSelectionString(text, MAX_PAGES);
    if (!parsed.ok) {
      setParsedPreview(null);
      setPreviewError(parseErrorMessage(parsed.error, MAX_PAGES));
      return;
    }
    if (parsed.pages.length === 0) {
      setParsedPreview(null);
      setPreviewError(null);
      return;
    }
    setParsedPreview(parsed.pages);
    setPreviewError(null);
  }, []);

  const trimLen = pagesInput.trim().length;
  const hasParsedPreview = parsedPreview !== null && parsedPreview.length > 0;
  const canSubmit = file !== null && (trimLen === 0 || hasParsedPreview) && phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file) return;
    if (trimLen > 0 && !hasParsedPreview) return;
    setFieldMsg(null);
    setPhase('uploading');
    try {
      const result = await submitForSplit(file, pagesInput, setPhase);
      if (result.ok) {
        const pages = result.pages;
        if (pages !== null) setTotalPagesHint(pages);
        triggerDownload(result.blob, result.filename);
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.blob.size,
          outputFormat: 'PDF',
          kind: 'dividir-pdf',
        });
        const note = pages !== null ? ` (${pages} ${pages === 1 ? 'página' : 'páginas'})` : '';
        toast.success(`PDF extraído${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
      } else {
        if (result.fieldMessage) setFieldMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, hasParsedPreview, pagesInput, trimLen, history.add]);

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
          Dividir PDF
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Sube un PDF y extrae las páginas que quieras (
          <span className="font-medium text-foreground">&quot;1,3,5-7&quot;</span>) o todas las
          páginas en un nuevo archivo. Salida:{' '}
          <span className="font-medium text-foreground">un solo PDF</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y no se guarda en disco. Tamaño máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_PDF_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , hasta <span className="font-medium text-foreground">{MAX_PAGES} páginas</span>.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Selecciona un PDF de tu dispositivo y, si quieres extraer solo algunas páginas,
            indícalas abajo. Si lo dejas vacío se extraen todas las páginas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="pdf-split-input"
            onDragOver={(e) => {
              if (phase !== 'idle') return;
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              if (phase !== 'idle') return;
              e.preventDefault();
              setIsDragOver(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) void onAdoptFile(dropped);
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragOver
                ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20'
                : 'border-brand-300/70 bg-brand-50/30 hover:border-brand-500 hover:bg-brand-50/60 dark:bg-brand-900/10 dark:hover:bg-brand-900/20'
            }`}
          >
            <UploadIcon className="h-8 w-8 text-brand-500" aria-hidden="true" />
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {file ? 'Cambiar archivo' : 'Arrastra tu PDF aquí'}
            </span>
            <span className="text-xs text-muted-foreground">
              o haz clic para seleccionar — máx. {(MAX_PDF_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="pdf-split-input"
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                void onAdoptFile(picked);
                e.target.value = '';
              }}
            />
          </Label>

          {file && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background"
                  aria-hidden="true"
                >
                  <FileText className="h-5 w-5 text-brand-500" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-foreground">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{humanSize(file.size)}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={phase !== 'idle'}
                onClick={onRemoveFile}
                aria-label="Quitar PDF"
              >
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="pdf-split-pages" className="text-sm font-medium text-foreground">
              Páginas a extraer
            </Label>
            <Input
              id="pdf-split-pages"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Todas"
              value={pagesInput}
              onChange={(e) => onPagesChange(e.target.value)}
              disabled={phase !== 'idle'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Todas las páginas si lo dejas vacío. Ejemplos válidos:{' '}
              <span className="font-mono text-foreground">1,3,5-7</span> ·{' '}
              <span className="font-mono text-foreground">2-4</span> ·{' '}
              <span className="font-mono text-foreground">1,2,3</span>
            </p>
            {trimLen > 0 && hasParsedPreview && (
              <p className="text-xs font-medium text-brand-700 dark:text-brand-300">
                Extraerás: {parsedPreview?.join(', ')}
              </p>
            )}
            {previewError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {previewError}
              </p>
            )}
          </div>

          {totalPagesHint !== null && (
            <div className="flex items-center gap-2 rounded-md border border-brand-300/40 bg-brand-50/50 px-3 py-2 text-sm text-brand-700 dark:border-brand-700/50 dark:bg-brand-900/20 dark:text-brand-300">
              <FileDown className="h-4 w-4" aria-hidden="true" />
              El PDF tiene {totalPagesHint} {totalPagesHint === 1 ? 'página' : 'páginas'}.
            </div>
          )}

          {fieldMsg && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {fieldMsg}
            </p>
          )}

          {phase !== 'idle' && (
            <output className="flex flex-col gap-2">
              <Progress
                value={phase === 'uploading' ? 45 : 90}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Extrayendo páginas en el servidor…'}
              </p>
            </output>
          )}

          <Button
            type="button"
            size="lg"
            disabled={!canSubmit}
            aria-busy={phase !== 'idle'}
            onClick={() => void onSubmit()}
            className="gap-2 text-base font-semibold"
          >
            {phase === 'idle' ? 'Dividir PDF' : phase === 'uploading' ? 'Subiendo…' : 'Extrayendo…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_PDF_BYTES / (1024 * 1024)).toFixed(0)} MB y contener
            hasta {MAX_PAGES} páginas.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="dividir-pdf" className="w-full" />
    </main>
  );
}
