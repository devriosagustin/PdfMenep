'use client';

import {
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  PenLine,
  Plus,
  Trash2,
  Upload as UploadIcon,
  X,
} from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { downloadNameForSign, filenameFromContentDisposition } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_LOCATION_LEN,
  MAX_PASSWORD_LEN,
  MAX_REASON_LEN,
  MAX_SIGN_BYTES,
  MAX_SIGNER_NAME_LEN,
  MAX_SIGNERS,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-sign';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'signing';

interface SignerDraft {
  id: string;
  name: string;
  reason: string;
  location: string;
  signingDate: boolean;
}

function makeSigner(): SignerDraft {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `signer-${Math.random().toString(36).slice(2)}`,
    name: '',
    reason: '',
    location: '',
    signingDate: true,
  };
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  signedOn: 'file' | 'signers' | 'password' | null;
  toastMessage: string;
}

async function submitForSign(
  file: File,
  payload: {
    signers: ReadonlyArray<{
      name: string;
      reason?: string;
      location?: string;
      signingDate?: boolean;
    }>;
    password: string | undefined;
    signingDateToday: string;
  },
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('signers', JSON.stringify(payload.signers));
  form.append('signingDateToday', payload.signingDateToday);
  if (payload.password && payload.password.length > 0) {
    form.append('password', payload.password);
  }

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/sign', {
      method: 'POST',
      body: form,
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      fieldMessage: null,
      signedOn: null,
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
      const signersMsg = fieldErrors.signers;
      if (signersMsg) {
        return {
          ok: false,
          fieldMessage: signersMsg,
          signedOn: 'signers',
          toastMessage: signersMsg,
        };
      }
      const passwordMsg = fieldErrors.password;
      if (passwordMsg) {
        return {
          ok: false,
          fieldMessage: passwordMsg,
          signedOn: 'password',
          toastMessage: passwordMsg,
        };
      }
      const fileMsg = fieldErrors.file;
      if (fileMsg) {
        return { ok: false, fieldMessage: fileMsg, signedOn: 'file', toastMessage: fileMsg };
      }
      const firstValue = Object.values(fieldErrors)[0];
      if (firstValue) {
        return {
          ok: false,
          fieldMessage: firstValue,
          signedOn: null,
          toastMessage: firstValue,
        };
      }
    }
    const plain = (body as ServerPlainError | null)?.error;
    return {
      ok: false,
      fieldMessage: null,
      signedOn: null,
      toastMessage: plain ?? `Error ${res.status}`,
    };
  }

  onPhaseChange('signing');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForSign(file.name);
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

export function FirmarPdfClient() {
  const history = useLocalHistory('firmar-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<SignerDraft[]>([makeSigner()]);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [signedOn, setSignedOn] = useState<'file' | 'signers' | 'password' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const todayString = useRef<string>(todayIso()).current;

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_SIGN_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_SIGN_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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

  const onAddSigner = useCallback(() => {
    setSigners((prev) => {
      if (prev.length >= MAX_SIGNERS) return prev;
      return [...prev, makeSigner()];
    });
  }, []);

  const onRemoveSigner = useCallback((id: string) => {
    setSigners((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const onUpdateSigner = useCallback((id: string, patch: Partial<Omit<SignerDraft, 'id'>>) => {
    setSigners((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const canSubmit =
    file !== null &&
    signers.length >= 1 &&
    signers.every((s) => s.name.trim().length > 0) &&
    phase === 'idle';

  const signerLengthHint = MAX_SIGNER_NAME_LEN;

  const onSubmit = useCallback(async () => {
    if (!file) return;
    setFieldMsg(null);
    setSignedOn(null);
    // Local validation — repeat cap checks so the UI mirrors the wire
    // contract and the user gets inline feedback before round-tripping.
    for (const s of signers) {
      if (s.name.trim().length === 0) {
        setFieldMsg('Indica el nombre de cada firmante');
        setSignedOn('signers');
        return;
      }
      if (s.name.length > signerLengthHint) {
        setFieldMsg(`El nombre debe tener como máximo ${signerLengthHint} caracteres`);
        setSignedOn('signers');
        return;
      }
      if (s.reason.length > MAX_REASON_LEN) {
        setFieldMsg(`El motivo debe tener como máximo ${MAX_REASON_LEN} caracteres`);
        setSignedOn('signers');
        return;
      }
      if (s.location.length > MAX_LOCATION_LEN) {
        setFieldMsg(`El lugar debe tener como máximo ${MAX_LOCATION_LEN} caracteres`);
        setSignedOn('signers');
        return;
      }
    }
    if (passwordEnabled && password.length > MAX_PASSWORD_LEN) {
      setFieldMsg(`La contraseña debe tener como máximo ${MAX_PASSWORD_LEN} caracteres`);
      setSignedOn('password');
      return;
    }

    setPhase('uploading');
    try {
      const effectivePassword = passwordEnabled && password.length > 0 ? password : undefined;
      const result = await submitForSign(
        file,
        {
          signers: signers.map((s) => ({
            name: s.name.trim(),
            reason: s.reason.trim() || undefined,
            location: s.location.trim() || undefined,
            signingDate: s.signingDate,
          })),
          password: effectivePassword,
          signingDateToday: todayString,
        },
        setPhase,
      );
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note =
          pages !== null
            ? ` (${pages} ${pages === 1 ? 'página firmada' : 'páginas firmadas'}, ${humanSize(result.outputBytes)})`
            : ` (${humanSize(result.outputBytes)})`;
        toast.success(`PDF firmado${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'firmar-pdf',
        });
        setPassword('');
        setPasswordEnabled(false);
        setSigners([makeSigner()]);
      } else {
        if (result.fieldMessage) {
          setFieldMsg(result.fieldMessage);
          if (result.signedOn) setSignedOn(result.signedOn);
        }
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, signers, passwordEnabled, password, history, signerLengthHint, todayString]);

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
          Firmar PDF
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Añade firmas visibles a tu PDF: nombre del firmante, motivo, lugar y fecha. Ideal para
          documentos compartidos por correo o plataformas de mensajería.{' '}
          <span className="font-medium text-foreground">Salida: el mismo PDF firmado</span>.
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <PenLine className="h-4 w-4" aria-hidden />
          Firma visible — sin certificado digital
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Las firmas se dibujan al final de cada página con el nombre del firmante. El PDF se
          procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. Tamaño
          máximo:{' '}
          <span className="font-medium text-foreground">
            {(MAX_SIGN_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          . Si está protegido con contraseña, márcalo abajo e introdúcela para poder firmarlo.
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. A continuación, completa los datos del
            firmante (nombre obligatorio; motivo, lugar y fecha opcionales).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="firmar-pdf-input"
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
              o haz clic para seleccionar — máx. {(MAX_SIGN_BYTES / (1024 * 1024)).toFixed(0)} MB
            </span>
            <Input
              id="firmar-pdf-input"
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

          {/* Signers — a dynamic list of 1..MAX_SIGNERS rows. Each row
              captures name (required), reason, location, and a "use today's
              date" toggle. Per-row caps echo the server-side contract so
              the UI never lets the user submit an over-length value. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium text-foreground">
                Firmantes ({signers.length} / {MAX_SIGNERS})
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddSigner}
                disabled={signers.length >= MAX_SIGNERS || phase !== 'idle'}
                className="gap-1"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Añadir firmante
              </Button>
            </div>

            {signers.map((s, idx) => (
              <SignerRow
                key={s.id}
                signer={s}
                index={idx}
                canRemove={signers.length > 1}
                disabled={phase !== 'idle'}
                invalid={signedOn === 'signers'}
                onChange={(patch) => onUpdateSigner(s.id, patch)}
                onRemove={() => onRemoveSigner(s.id)}
                todayLabel={todayString}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 text-brand-500" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <Label
                  htmlFor="firmar-pdf-password-toggle"
                  className="text-sm font-medium text-foreground"
                >
                  El PDF está protegido con contraseña
                </Label>
                <span className="text-xs text-muted-foreground">
                  Activa esta opción solo si el PDF pide una clave al abrirlo.
                </span>
              </div>
            </div>
            <Switch
              id="firmar-pdf-password-toggle"
              checked={passwordEnabled}
              onCheckedChange={(v) => setPasswordEnabled(v === true)}
              disabled={phase !== 'idle'}
              aria-label="Activar contraseña"
            />
          </div>

          {passwordEnabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="firmar-pdf-password" className="text-sm font-medium text-foreground">
                Contraseña del PDF
              </Label>
              <p className="text-xs text-muted-foreground">
                Si el PDF está protegido con contraseña, indícala para desbloquearlo antes de
                firmarlo.{' '}
                <span className="font-medium text-foreground">Nunca se almacena ni se guarda</span>.
              </p>
              <div className="relative">
                <Input
                  id="firmar-pdf-password"
                  name="firmar-pdf-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  value={password}
                  disabled={phase !== 'idle'}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="La contraseña del PDF (opcional si ya lo abres sin clave)"
                  aria-invalid={signedOn === 'password'}
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
              {passwordEnabled && password.length > MAX_PASSWORD_LEN && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  La contraseña debe tener como máximo {MAX_PASSWORD_LEN} caracteres
                </p>
              )}
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
                {phase === 'uploading' ? 'Subiendo PDF…' : 'Firmando el PDF en el servidor…'}
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
            <PenLine className="h-4 w-4" aria-hidden />
            {phase === 'idle'
              ? 'Firmar y descargar'
              : phase === 'uploading'
                ? 'Subiendo…'
                : 'Firmando…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_SIGN_BYTES / (1024 * 1024)).toFixed(0)} MB. La firma no
            incluye certificado digital — es una firma visible sobre el documento.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="firmar-pdf" className="w-full" />
    </main>
  );
}

interface SignerRowProps {
  signer: SignerDraft;
  index: number;
  canRemove: boolean;
  disabled: boolean;
  invalid: boolean;
  onChange: (patch: Partial<Omit<SignerDraft, 'id'>>) => void;
  onRemove: () => void;
  todayLabel: string;
}

function SignerRow({
  signer,
  index,
  canRemove,
  disabled,
  invalid,
  onChange,
  onRemove,
  todayLabel,
}: SignerRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-300/70 bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Firmante {index + 1}
          </span>
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Quitar firmante ${index + 1}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`firmar-pdf-signer-name-${index}`}
          className="text-sm font-medium text-foreground"
        >
          Nombre del firmante
        </Label>
        <Input
          id={`firmar-pdf-signer-name-${index}`}
          name={`firmar-pdf-signer-name-${index}`}
          type="text"
          autoComplete="off"
          value={signer.name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ej. Juan Pérez"
          maxLength={MAX_SIGNER_NAME_LEN}
          aria-invalid={invalid}
          aria-describedby={`firmar-pdf-signer-name-hint-${index}`}
        />
        <p id={`firmar-pdf-signer-name-hint-${index}`} className="text-xs text-muted-foreground">
          Máx. {MAX_SIGNER_NAME_LEN} caracteres
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`firmar-pdf-signer-reason-${index}`}
          className="text-sm font-medium text-foreground"
        >
          Motivo (opcional)
        </Label>
        <Input
          id={`firmar-pdf-signer-reason-${index}`}
          name={`firmar-pdf-signer-reason-${index}`}
          type="text"
          autoComplete="off"
          value={signer.reason}
          disabled={disabled}
          onChange={(e) => onChange({ reason: e.target.value })}
          placeholder="Ej. Aprobación del contrato"
          maxLength={MAX_REASON_LEN}
        />
        <p className="text-xs text-muted-foreground">
          Razón por la que se firma — máx. {MAX_REASON_LEN} caracteres
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`firmar-pdf-signer-location-${index}`}
          className="text-sm font-medium text-foreground"
        >
          Lugar (opcional)
        </Label>
        <Input
          id={`firmar-pdf-signer-location-${index}`}
          name={`firmar-pdf-signer-location-${index}`}
          type="text"
          autoComplete="off"
          value={signer.location}
          disabled={disabled}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Ej. Bogotá, Colombia"
          maxLength={MAX_LOCATION_LEN}
        />
        <p className="text-xs text-muted-foreground">
          Ciudad o ubicación — máx. {MAX_LOCATION_LEN} caracteres
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/30 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <Label
            htmlFor={`firmar-pdf-signer-date-${index}`}
            className="text-sm font-medium text-foreground"
          >
            Usar fecha de hoy
          </Label>
          <span className="text-xs text-muted-foreground">
            {signer.signingDate ? `Marca con fecha ${todayLabel}` : 'Sin fecha en la firma'}
          </span>
        </div>
        <Switch
          id={`firmar-pdf-signer-date-${index}`}
          checked={signer.signingDate}
          onCheckedChange={(v) => onChange({ signingDate: v === true })}
          disabled={disabled}
          aria-label={`Incluir fecha de firma para el firmante ${index + 1}`}
        />
      </div>
    </div>
  );
}
