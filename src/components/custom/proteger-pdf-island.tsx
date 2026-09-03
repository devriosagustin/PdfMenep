'use client';

import {
  Eye,
  EyeOff,
  FileText,
  Lock,
  ShieldCheck,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { downloadNameForProtect, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import {
  classifyPasswordStrength,
  MAX_FILENAME_LEN,
  MAX_PROTECT_BYTES,
  MIN_PASSWORD_LEN,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-protect';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

import { RecentResultsStrip } from './recent-results-strip';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'protecting';

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

async function submitForProtect(
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
    res = await fetch('/api/pdf/protect', {
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

  onPhaseChange('protecting');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForProtect(file.name);
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

function strengthLabel(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'Débil';
    case 'medium':
      return 'Media';
    case 'strong':
      return 'Fuerte';
  }
}

function strengthTone(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'border-destructive/40 bg-destructive/5 text-destructive';
    case 'medium':
      return 'border-amber-300/60 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
    case 'strong':
      return 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
}

export function ProtegerPdfClient() {
  const history = useLocalHistory('proteger-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const strength = useMemo(() => classifyPasswordStrength(password), [password]);

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_PROTECT_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_PROTECT_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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

  const canSubmit =
    file !== null &&
    password.length >= MIN_PASSWORD_LEN &&
    password === confirm &&
    phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setFieldMsg(null);
    setConfirmMsg(null);
    if (password.length < MIN_PASSWORD_LEN) {
      setFieldMsg(`La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres`);
      return;
    }
    if (password !== confirm) {
      setConfirmMsg('Las contraseñas no coinciden');
      return;
    }
    setPhase('uploading');
    try {
      const result = await submitForProtect(file, password, setPhase);
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note = pages !== null ? ` (${pages === 1 ? 'página' : 'páginas'})` : '';
        toast.success(`PDF protegido${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado. Ábrelo con la contraseña que has elegido.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'proteger-pdf',
        });
        setPassword('');
        setConfirm('');
      } else {
        if (result.fieldMessage) {
          setFieldMsg(result.fieldMessage);
        }
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, password, confirm, history]);

  const onClearPassword = useCallback(() => {
    setPassword('');
    setConfirm('');
    setConfirmMsg(null);
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
          Proteger PDF con contraseña
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Añade una contraseña a tu PDF para que{' '}
          <span className="font-medium text-foreground">solo quien la conozca pueda abrirlo</span>.
          Ideal para compartir documentos sensibles por correo o servicios de mensajería.{' '}
          <span className="font-medium text-foreground">Salida: el mismo PDF cifrado</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Cifrado AES-128 aplicado
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. La
          contraseña se aplica con cifrado estándar PDF (compatible con Acrobat, Preview, Chrome).
          Tamaño máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_PROTECT_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          .
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. A continuación, elige una contraseña de
            al menos {MIN_PASSWORD_LEN} caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="proteger-pdf-input"
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
              o haz clic para seleccionar — máx. {(MAX_PROTECT_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="proteger-pdf-input"
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
            <Label htmlFor="proteger-pdf-password" className="text-sm font-medium text-foreground">
              Contraseña
            </Label>
            <div className="relative">
              <Input
                id="proteger-pdf-password"
                name="proteger-pdf-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                inputMode="text"
                value={password}
                disabled={phase !== 'idle'}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Mínimo ${MIN_PASSWORD_LEN} caracteres`}
                aria-describedby="proteger-pdf-strength"
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

            {password.length > 0 && (
              <Badge
                id="proteger-pdf-strength"
                variant="outline"
                className={`w-fit text-xs ${strengthTone(strength)}`}
                aria-live="polite"
              >
                Seguridad: {strengthLabel(strength)}
              </Badge>
            )}

            <Label htmlFor="proteger-pdf-confirm" className="text-sm font-medium text-foreground">
              Repetir contraseña
            </Label>
            <Input
              id="proteger-pdf-confirm"
              name="proteger-pdf-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              disabled={phase !== 'idle'}
              onChange={(e) => {
                setConfirm(e.target.value);
                setConfirmMsg(null);
              }}
              placeholder="Vuelve a escribir la contraseña"
            />

            {confirmMsg && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
              >
                {confirmMsg}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Usa una contraseña que puedas recordar: <strong>no la guardamos</strong> y no podemos
              recuperarla por ti.
            </p>
          </div>

          {phase !== 'idle' && (
            <output className="flex flex-col gap-2">
              <Progress
                value={phase === 'uploading' ? 45 : 90}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Cifrando PDF en el servidor…'}
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
              <Lock className="h-4 w-4" aria-hidden />
              {phase === 'idle'
                ? 'Proteger y descargar'
                : phase === 'uploading'
                  ? 'Subiendo…'
                  : 'Cifrando…'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={phase !== 'idle' || (password.length === 0 && confirm.length === 0)}
              onClick={onClearPassword}
              className="text-sm font-medium"
            >
              Borrar contraseñas
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Procesamiento privado y sin marca de agua. Tamaño máx.{' '}
            {(MAX_PROTECT_BYTES / (1024 * 1024)).toFixed(0)} MB.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="proteger-pdf" className="w-full" />
    </main>
  );
}
