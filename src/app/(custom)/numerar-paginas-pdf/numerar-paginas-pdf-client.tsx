'use client';

import { FileText, Hash, Trash2, Upload as UploadIcon } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  downloadNameForPageNumbers,
  filenameFromContentDisposition,
} from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_PAGE_NUMBERS_BYTES,
  PDF_MAGIC,
  type PdfNumberPosition,
} from '@/lib/contracts/pdf-page-numbers';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'stamping';

const POSITIONS: Array<{
  value: PdfNumberPosition;
  label: string;
  hint: string;
}> = [
  { value: 'top-left', label: 'Arriba · izquierda', hint: 'esquina superior izquierda' },
  { value: 'top-center', label: 'Arriba · centro', hint: 'centro del borde superior' },
  { value: 'top-right', label: 'Arriba · derecha', hint: 'esquina superior derecha' },
  { value: 'bottom-left', label: 'Abajo · izquierda', hint: 'esquina inferior izquierda' },
  { value: 'bottom-center', label: 'Abajo · centro', hint: 'centro del borde inferior' },
  { value: 'bottom-right', label: 'Abajo · derecha', hint: 'esquina inferior derecha' },
];

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

async function submitForPageNumbers(
  file: File,
  position: PdfNumberPosition,
  startingNumber: number,
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('position', position);
  form.append('startingNumber', String(startingNumber));

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/page-numbers', {
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

  onPhaseChange('stamping');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForPageNumbers(file.name);
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

export function NumerarPaginasPdfClient() {
  const history = useLocalHistory('numerar-paginas-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<PdfNumberPosition>('bottom-right');
  const [startingNumberText, setStartingNumberText] = useState('1');
  const [startingNumberError, setStartingNumberError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parsedStartingNumber = useMemo(() => {
    const trimmed = startingNumberText.trim();
    if (trimmed.length === 0) return null;
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || String(n) !== trimmed) return null;
    return n;
  }, [startingNumberText]);

  const startingNumber =
    parsedStartingNumber !== null && parsedStartingNumber >= 1 ? parsedStartingNumber : null;

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_PAGE_NUMBERS_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_PAGE_NUMBERS_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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

  const onStartingNumberChange = useCallback((text: string) => {
    setStartingNumberText(text);
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setStartingNumberError(null);
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setStartingNumberError('Indica el número desde el que empezar (un entero)');
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (n < 1) {
      setStartingNumberError('El número de inicio debe ser 1 o más');
      return;
    }
    setStartingNumberError(null);
  }, []);

  const canSubmit =
    file !== null && startingNumber !== null && startingNumberError === null && phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file || startingNumber === null) return;
    setFieldMsg(null);
    setPhase('uploading');
    try {
      const result = await submitForPageNumbers(file, position, startingNumber, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note =
          pages !== null
            ? ` (${pages} ${pages === 1 ? 'página' : 'páginas'}, ${humanSize(result.outputBytes)})`
            : '';
        toast.success(`PDF numerado${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'numerar-paginas-pdf',
        });
      } else {
        if (result.fieldMessage) setFieldMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, position, startingNumber, history.add]);

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
          Numerar páginas PDF
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Sube un PDF y estampa un número en cada página eligiendo el{' '}
          <span className="font-medium text-foreground">número inicial</span> y la{' '}
          <span className="font-medium text-foreground">posición</span> (arriba o abajo, a la
          izquierda, al centro o a la derecha).{' '}
          <span className="font-medium text-foreground">Salida: el mismo PDF numerado</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <Hash className="h-4 w-4" aria-hidden />
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. Tamaño
          máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_PAGE_NUMBERS_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          , un solo archivo por operación.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. Elige el número inicial y la posición
            donde se estampara el número en cada página.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="pdf-page-numbers-input"
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
              {(MAX_PAGE_NUMBERS_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="pdf-page-numbers-input"
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
            <Label htmlFor="pdf-page-numbers-start" className="text-sm font-medium text-foreground">
              Número inicial
            </Label>
            <Input
              id="pdf-page-numbers-start"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="p. ej. 1"
              value={startingNumberText}
              onChange={(e) => onStartingNumberChange(e.target.value)}
              disabled={phase !== 'idle'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              La primera página del PDF se numerará con este valor y las siguientes se incrementan
              de 1 en 1.
            </p>
            {startingNumberError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {startingNumberError}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Posición del número</legend>
            <RadioGroup
              value={position}
              onValueChange={(v: string) => setPosition(v as PdfNumberPosition)}
              disabled={phase !== 'idle'}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {POSITIONS.map((opt) => {
                const id = `pdf-page-numbers-pos-${opt.value}`;
                return (
                  <Label
                    htmlFor={id}
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                      position === opt.value
                        ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30'
                        : ''
                    }`}
                  >
                    <RadioGroupItem id={id} value={opt.value} className="mt-0.5" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.hint}</span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          </fieldset>

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
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Numerando páginas en el servidor…'}
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
            {phase === 'idle' ? 'Numerar PDF' : phase === 'uploading' ? 'Subiendo…' : 'Numerando…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_PAGE_NUMBERS_BYTES / (1024 * 1024)).toFixed(0)} MB. La
            numeración estampa un número en cada página — no añade ni quita páginas.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="numerar-paginas-pdf" className="w-full" />
    </main>
  );
}
