'use client';

import {
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LockOpen,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { downloadNameForUnlock, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_UNLOCK_BYTES,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-unlock';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

import { RecentResultsStrip } from './recent-results-strip';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'unlocking';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readPdfMagic(file: File): Promise<boolean> {
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

async function submitForUnlock(
  file: File,
  password: string,
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('password', password);

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/unlock', {
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
      const passMsg = fieldErrors.password;
      if (passMsg) {
        return { ok: false, fieldMessage: passMsg, toastMessage: passMsg };
      }
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

  onPhaseChange('unlocking');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForUnlock(file.name);
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

export function DesbloquearPdfClient() {
  const history = useLocalHistory('desbloquear-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_UNLOCK_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_UNLOCK_BYTES / (1024 * 1024)).toFixed(0)} MB`);
      setFile(null);
      return;
    }
    const valid = await readPdfMagic(next);
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

  const canSubmit = file !== null && password.length > 0 && phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setFieldMsg(null);
    if (password.length === 0) {
      setFieldMsg('Indica la contraseña del PDF');
      return;
    }
    if (password.length > MAX_PASSWORD_LEN) {
      setFieldMsg(`La contraseña debe tener como máximo ${MAX_PASSWORD_LEN} caracteres`);
      return;
    }
    setPhase('uploading');
    try {
      const result = await submitForUnlock(file, password, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note = pages !== null ? ` (${pages === 1 ? 'página' : 'páginas'})` : '';
        toast.success(`PDF desbloqueado${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado. Abre el archivo sin necesidad de contraseña.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'desbloquear-pdf',
        });
        setPassword('');
      } else {
        if (result.fieldMessage) {
          setFieldMsg(result.fieldMessage);
        }
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, password, history]);

  const onClearPassword = useCallback(() => {
    setPassword('');
    setShowPassword(false);
  }, []);

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
          Desbloquear PDF
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Quita la contraseña de un PDF que ya puedes abrir. Útil para volver a imprimir, archivar o
          compartir un documento sin pedir la clave cada vez.{' '}
          <span className="font-medium text-foreground">Salida: el mismo PDF sin cifrar</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <KeyRound className="h-4 w-4" aria-hidden />
          Necesitas la contraseña
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Para desbloquear un PDF{' '}
          <span className="font-medium text-foreground">necesitas su contraseña actual</span>. Tu
          archivo se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. Tamaño
          máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_UNLOCK_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          .
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF protegido</CardTitle>
          <CardDescription>
            Arrastra un PDF con contraseña o haz clic para seleccionarlo. Indica la contraseña y
            descarga una copia sin cifrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="desbloquear-pdf-input"
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
              o haz clic para seleccionar — máx. {(MAX_UNLOCK_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="desbloquear-pdf-input"
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

          {fieldMsg && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {fieldMsg}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Label
              htmlFor="desbloquear-pdf-password"
              className="text-sm font-medium text-foreground"
            >
              Contraseña del PDF
            </Label>
            <div className="relative">
              <Input
                id="desbloquear-pdf-password"
                name="desbloquear-pdf-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                disabled={phase !== 'idle'}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="La contraseña que protege el PDF"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={phase !== 'idle'}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {phase !== 'idle' && (
            <output className="flex flex-col gap-2">
              <Progress
                value={phase === 'uploading' ? 45 : 90}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Quitando contraseña en el servidor…'}
              </p>
            </output>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="lg"
              disabled={!canSubmit}
              aria-busy={phase !== 'idle'}
              onClick={() => void onSubmit()}
              className="flex-1 gap-2 text-base font-semibold"
            >
              <LockOpen className="h-4 w-4" aria-hidden />
              {phase === 'idle'
                ? 'Desbloquear y descargar'
                : phase === 'uploading'
                  ? 'Subiendo…'
                  : 'Desbloqueando…'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={phase !== 'idle' || password.length === 0}
              onClick={onClearPassword}
              className="text-sm font-medium"
            >
              Borrar contraseña
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Procesamiento privado y sin marca de agua. Tamaño máx.{' '}
            {(MAX_UNLOCK_BYTES / (1024 * 1024)).toFixed(0)} MB.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="desbloquear-pdf" className="w-full" />
    </main>
  );
}
