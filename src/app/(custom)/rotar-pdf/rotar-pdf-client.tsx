'use client';

import { FileText, RotateCw, Trash2, Upload as UploadIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { downloadNameForRotate, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_ROTATE_BYTES,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-rotate';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

type RotationChoice = 'none' | '90' | '180' | '270';

function isRealDegree(choice: RotationChoice): choice is '90' | '180' | '270' {
  return choice !== 'none';
}

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'rotating';

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
  outputBytes: number;
}
interface SubmitErr {
  ok: false;
  fieldMessage: string | null;
  toastMessage: string;
}

async function submitForRotate(
  file: File,
  rotations: Array<{ page: number; deg: '90' | '180' | '270' }>,
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('rotations', JSON.stringify(rotations));

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/rotate', {
      method: 'POST',
      body: form,
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      fieldMessage: null,
      toastMessage: 'No se pudo conectar al servidor',
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
        };
      }
      const firstValue = Object.values(fieldErrors)[0];
      if (firstValue) {
        return {
          ok: false,
          fieldMessage: firstValue,
          toastMessage: firstValue,
        };
      }
    }
    const plain = (body as ServerPlainError | null)?.error;
    return {
      ok: false,
      fieldMessage: null,
      toastMessage: plain ?? `Error ${res.status}`,
    };
  }

  onPhaseChange('rotating');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForRotate(file.name);
  const filename = filenameFromContentDisposition(cd, fallbackName);
  const pagesHeader = res.headers.get('x-pages');
  const pages = pagesHeader ? Number(pagesHeader) : null;
  return {
    ok: true,
    blob,
    filename,
    pages: Number.isFinite(pages) ? pages : null,
    outputBytes: blob.size,
  };
}

export function RotarPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCountText, setPageCountText] = useState('');
  const [choices, setChoices] = useState<RotationChoice[]>([]);
  const [pageCountError, setPageCountError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const history = useLocalHistory('rotar-pdf');

  const parsedPageCount = useMemo(() => {
    const trimmed = pageCountText.trim();
    if (trimmed.length === 0) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || String(n) !== trimmed) return null;
    return n;
  }, [pageCountText]);

  const pageCount =
    parsedPageCount !== null && parsedPageCount >= 1 && parsedPageCount <= MAX_PAGES
      ? parsedPageCount
      : null;

  useEffect(() => {
    setChoices((prev) => {
      if (pageCount === null) return prev.length > 0 ? [] : prev;
      if (prev.length === pageCount) return prev;
      if (prev.length < pageCount) {
        const next = prev.slice();
        while (next.length < pageCount) next.push('none');
        return next;
      }
      return prev.slice(0, pageCount);
    });
  }, [pageCount]);

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_ROTATE_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_ROTATE_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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
    setFieldMsg(null);
  }, []);

  const onPageCountChange = useCallback((text: string) => {
    setPageCountText(text);
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setPageCountError(null);
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setPageCountError('Indica el número total de páginas del PDF (un entero)');
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (n < 1) {
      setPageCountError('El número de páginas debe ser 1 o más');
      return;
    }
    if (n > MAX_PAGES) {
      setPageCountError(`Máximo ${MAX_PAGES} páginas`);
      return;
    }
    setPageCountError(null);
  }, []);

  const onChoiceChange = useCallback((index: number, value: RotationChoice) => {
    setChoices((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const rotationsCount = choices.filter(isRealDegree).length;
  const canSubmit =
    file !== null &&
    pageCount !== null &&
    pageCountError === null &&
    rotationsCount > 0 &&
    phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file || pageCount === null) return;
    if (rotationsCount === 0) {
      toast.error('Indica al menos una página para rotar');
      return;
    }
    setFieldMsg(null);
    const rotations = choices
      .map((deg, idx) => ({ page: idx + 1, deg }))
      .filter((r): r is { page: number; deg: '90' | '180' | '270' } => r.deg !== 'none');
    setPhase('uploading');
    try {
      const result = await submitForRotate(file, rotations, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note =
          pages !== null
            ? ` (${pages} ${pages === 1 ? 'página' : 'páginas'}, ${humanSize(result.outputBytes)})`
            : '';
        toast.success(`PDF rotado${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'rotar-pdf',
        });
      } else {
        if (result.fieldMessage) setFieldMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, pageCount, rotationsCount, choices, history.add]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-3 text-center">
        <Badge
          variant="outline"
          className="mx-auto text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
        >
          Privacidad total · Procesamiento 100% local
        </Badge>
        <h1 className="font-display text-h1 font-bold tracking-tight text-foreground">Rotar PDF</h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Sube un PDF, indica cuántas páginas tiene y elige el giro (
          <span className="font-medium text-foreground">90°, 180° o 270°</span>) para cada página
          que quieras corregir.{' '}
          <span className="font-medium text-foreground">Salida: un solo PDF</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <RotateCw className="h-4 w-4" aria-hidden />
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. Tamaño
          máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_ROTATE_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , un solo archivo por operación.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. Indica debajo cuántas páginas tiene y
            marca el giro que prefieras en cada una (las que dejes en «Sin rotar» no cambian).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="pdf-rotate-input"
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
              o haz clic para seleccionar — máx. {(MAX_ROTATE_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="pdf-rotate-input"
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
            <Label htmlFor="pdf-rotate-pagecount" className="text-sm font-medium text-foreground">
              Número de páginas del PDF
            </Label>
            <Input
              id="pdf-rotate-pagecount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={`p. ej. 12`}
              value={pageCountText}
              onChange={(e) => onPageCountChange(e.target.value)}
              disabled={phase !== 'idle'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Introduce el total de páginas del PDF (máximo {MAX_PAGES}). Después podrás elegir el
              giro para cada página.
            </p>
            {pageCountError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {pageCountError}
              </p>
            )}
          </div>

          {pageCount !== null && choices.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Giro por página</p>
              <ul className="flex flex-col gap-2">
                {choices.map((choice, idx) => {
                  const page = idx + 1;
                  const triggerId = `pdf-rotate-page-${page}`;
                  return (
                    <li
                      key={page}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
                    >
                      <Label
                        htmlFor={triggerId}
                        className="font-mono text-sm font-medium text-foreground"
                      >
                        Página {page}
                      </Label>
                      <Select
                        value={choice}
                        onValueChange={(v) => onChoiceChange(idx, v as RotationChoice)}
                        disabled={phase !== 'idle'}
                      >
                        <SelectTrigger
                          id={triggerId}
                          className="w-40 data-[placeholder]:text-muted-foreground"
                        >
                          <SelectValue placeholder="Sin rotar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin rotar</SelectItem>
                          <SelectItem value="90">90°</SelectItem>
                          <SelectItem value="180">180°</SelectItem>
                          <SelectItem value="270">270°</SelectItem>
                        </SelectContent>
                      </Select>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                {rotationsCount === 0
                  ? 'Selecciona el giro en al menos una página para rotar.'
                  : `Rotarás ${rotationsCount} ${rotationsCount === 1 ? 'página' : 'páginas'} · el resto se conserva como está.`}
              </p>
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
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Rotando páginas en el servidor…'}
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
            {phase === 'idle' ? 'Rotar PDF' : phase === 'uploading' ? 'Subiendo…' : 'Rotando…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_ROTATE_BYTES / (1024 * 1024)).toFixed(0)} MB y contener
            hasta {MAX_PAGES} páginas.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="rotar-pdf" className="w-full" />
    </main>
  );
}
