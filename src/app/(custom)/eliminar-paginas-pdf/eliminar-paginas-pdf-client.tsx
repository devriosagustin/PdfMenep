'use client';

import { FileText, Trash2, Upload as UploadIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RecentResultsStrip } from '@/components/custom/recent-results-strip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  downloadNameForDeletePages,
  filenameFromContentDisposition,
} from '@/lib/business/pdf-format';
import {
  MAX_DELETE_PAGES_BYTES,
  MAX_FILENAME_LEN,
  MAX_PAGES,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-delete-pages';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'deleting';

type ParseStatus = { ok: true; pages: number[] } | { ok: false; reason: string };

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

async function submitForDeletePages(
  file: File,
  pages: number[],
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('pages', JSON.stringify(pages));

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/delete-pages', {
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

  onPhaseChange('deleting');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForDeletePages(file.name);
  const filename = filenameFromContentDisposition(cd, fallbackName);
  const pagesHeader = res.headers.get('x-pages');
  const pagesHeaderNum = pagesHeader ? Number(pagesHeader) : null;
  return {
    ok: true,
    blob,
    filename,
    pages: Number.isFinite(pagesHeaderNum) ? pagesHeaderNum : null,
    outputBytes: blob.size,
  };
}

// Client-side mirror of the server's parsePageSelectionString logic so the
// preview panel stays in lockstep with the wire envelope. We expand ranges
// into a unique ascending integer array and surface the friendly Spanish
// error used by /api/pdf/delete-pages on a parse rejection.
function tryParsePagesInput(input: string): ParseStatus {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Indica al menos una página para eliminar' };
  }
  const tokens = trimmed
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return { ok: false, reason: 'Indica al menos una página para eliminar' };
  }

  const result: number[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    if (token.includes('-')) {
      const sides = token.split('-');
      if (sides.length !== 2) {
        return {
          ok: false,
          reason:
            'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
        };
      }
      const aRaw = sides[0]?.trim() ?? '';
      const bRaw = sides[1]?.trim() ?? '';
      if (!/^\d+$/.test(aRaw) || !/^\d+$/.test(bRaw)) {
        return {
          ok: false,
          reason:
            'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
        };
      }
      const a = Number.parseInt(aRaw, 10);
      const b = Number.parseInt(bRaw, 10);
      if (a < 1 || b < 1 || a > MAX_PAGES || b > MAX_PAGES) {
        return { ok: false, reason: `Alguna página está fuera del rango 1–${MAX_PAGES}` };
      }
      if (a > b) {
        return {
          ok: false,
          reason:
            'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
        };
      }
      for (let n = a; n <= b; n++) {
        if (n > MAX_PAGES) {
          return { ok: false, reason: `Alguna página está fuera del rango 1–${MAX_PAGES}` };
        }
        if (seen.has(n)) {
          return { ok: false, reason: 'Hay páginas repetidas en la selección' };
        }
        seen.add(n);
        result.push(n);
      }
      continue;
    }
    if (!/^\d+$/.test(token)) {
      return {
        ok: false,
        reason:
          'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
      };
    }
    const n = Number.parseInt(token, 10);
    if (n < 1 || n > MAX_PAGES) {
      return { ok: false, reason: `Alguna página está fuera del rango 1–${MAX_PAGES}` };
    }
    if (seen.has(n)) {
      return { ok: false, reason: 'Hay páginas repetidas en la selección' };
    }
    seen.add(n);
    result.push(n);
  }

  if (result.length > MAX_PAGES) {
    return { ok: false, reason: `Selecciona como máximo ${MAX_PAGES} páginas` };
  }
  return { ok: true, pages: result };
}

export function EliminarPaginasPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesInput, setPagesInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const history = useLocalHistory('eliminar-paginas-pdf');

  const parsed = useMemo(() => tryParsePagesInput(pagesInput), [pagesInput]);
  const parsedPages = parsed.ok ? parsed.pages : [];
  const errorInInput = !parsed.ok;

  // Keep the inline parse-error pill in sync with the typed input, but
  // never let it clobber a server-side error until the user types again.
  const onPagesChange = useCallback((text: string) => {
    setPagesInput(text);
    const result = tryParsePagesInput(text);
    setParseError(result.ok ? null : result.reason);
  }, []);

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_DELETE_PAGES_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_DELETE_PAGES_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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
    setParseError(null);
    setFieldMsg(null);
  }, []);

  const canSubmit = file !== null && parsedPages.length > 0 && !errorInInput && phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file || parsedPages.length === 0) return;
    setFieldMsg(null);
    setPhase('uploading');
    try {
      const result = await submitForDeletePages(file, parsedPages, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note =
          pages !== null
            ? ` (${pages} ${pages === 1 ? 'página restante' : 'páginas restantes'}, ${humanSize(
                result.outputBytes,
              )})`
            : ` (${humanSize(result.outputBytes)})`;
        toast.success(`Páginas eliminadas${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'eliminar-paginas-pdf',
        });
      } else {
        if (result.fieldMessage) setFieldMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, parsedPages, history.add]);

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
          Eliminar páginas de PDF
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Sube un PDF, indica las páginas que quieres quitar (
          <span className="font-mono text-foreground">3,5-7</span>) y descarga el PDF sin esas
          páginas. <span className="font-medium text-foreground">Salida: un solo PDF</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. Tamaño
          máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_DELETE_PAGES_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , un solo archivo por operación.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. Después indica las páginas a eliminar con
            números y rangos separados por comas (por ejemplo{' '}
            <span className="font-mono text-foreground">1,3,5-7</span>).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="pdf-delete-pages-input"
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
              o haz clic para seleccionar — máx.{' '}
              {(MAX_DELETE_PAGES_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="pdf-delete-pages-input"
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
            <Label htmlFor="pdf-delete-pages-list" className="text-sm font-medium text-foreground">
              Páginas a eliminar
            </Label>
            <Textarea
              id="pdf-delete-pages-list"
              autoComplete="off"
              rows={3}
              placeholder="3,5-7"
              value={pagesInput}
              onChange={(e) => onPagesChange(e.target.value)}
              disabled={phase !== 'idle'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Ejemplos válidos: <span className="font-mono text-foreground">1,3,5-7</span> ·{' '}
              <span className="font-mono text-foreground">2-4</span> ·{' '}
              <span className="font-mono text-foreground">1,2,3</span> ·{' '}
              <span className="font-mono text-foreground">8</span>. Hasta {MAX_PAGES} páginas por
              operación.
            </p>
            {parsedPages.length > 0 && (
              <p className="text-xs font-medium text-brand-700 dark:text-brand-300">
                Eliminarás {parsedPages.length} {parsedPages.length === 1 ? 'página' : 'páginas'}:{' '}
                <span className="font-mono text-brand-700 dark:text-brand-300">
                  {parsedPages.join(', ')}
                </span>
              </p>
            )}
            {parseError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {parseError}
              </p>
            )}
          </div>

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
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Eliminando páginas en el servidor…'}
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
            {phase === 'idle'
              ? 'Eliminar páginas'
              : phase === 'uploading'
                ? 'Subiendo…'
                : 'Eliminando…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_DELETE_PAGES_BYTES / (1024 * 1024)).toFixed(0)} MB y
            puedes eliminar hasta {MAX_PAGES} páginas por operación.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="eliminar-paginas-pdf" className="w-full" />
    </main>
  );
}
