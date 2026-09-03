'use client';

import {
  FileText,
  Image as ImageIcon,
  Trash2,
  Type as TypeIcon,
  Upload as UploadIcon,
} from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import {
  downloadNameForWatermark,
  filenameFromContentDisposition,
} from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_IMAGE_BYTES,
  MAX_TEXT_LEN,
  MAX_WATERMARK_BYTES,
  MIN_FONT_SIZE,
  MIN_OPACITY,
  PDF_MAGIC,
  type PdfWatermarkMode,
  type PdfWatermarkPosition,
  type PdfWatermarkTilt,
} from '@/lib/contracts/pdf-watermark';
import { useLocalHistory } from '@/lib/hooks/use-local-history';

interface ServerFieldErrors {
  errors?: Record<string, string>;
}
interface ServerPlainError {
  error?: string;
}

type Phase = 'idle' | 'uploading' | 'stamping';

const POSITIONS: Array<{
  value: PdfWatermarkPosition;
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

interface SubmitParams {
  file: File;
  mode: PdfWatermarkMode;
  text: string;
  image: File | null;
  position: PdfWatermarkPosition;
  opacity: number;
  tiltDeg: PdfWatermarkTilt;
  fontSize: number;
}

async function submitForWatermark(
  params: SubmitParams,
  onPhaseChange: (phase: Phase) => void,
): Promise<SubmitOk | SubmitErr> {
  const form = new FormData();
  form.append('file', params.file, params.file.name);
  form.append('mode', params.mode);
  form.append('position', params.position);
  form.append('opacity', String(params.opacity));
  form.append('tiltDeg', String(params.tiltDeg));
  form.append('fontSize', String(params.fontSize));
  if (params.mode === 'text') {
    form.append('text', params.text);
  } else if (params.image) {
    form.append('image', params.image, params.image.name);
  }

  let res: Response;
  try {
    onPhaseChange('uploading');
    res = await fetch('/api/pdf/watermark', {
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

  onPhaseChange('stamping');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition');
  const fallbackName = downloadNameForWatermark(params.file.name);
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

export function MarcaAguaPdfClient() {
  const history = useLocalHistory('marca-de-agua-pdf');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<PdfWatermarkMode>('text');
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [position, setPosition] = useState<PdfWatermarkPosition>('bottom-right');
  const [opacity, setOpacity] = useState<number>(40);
  const [tiltDeg, setTiltDeg] = useState<PdfWatermarkTilt>(0);
  const [fontSizeText, setFontSizeText] = useState('36');
  const [fontSizeError, setFontSizeError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const parsedFontSize = useMemo(() => {
    const trimmed = fontSizeText.trim();
    if (trimmed.length === 0) return null;
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || String(n) !== trimmed) return null;
    return n;
  }, [fontSizeText]);

  const fontSize =
    parsedFontSize !== null && parsedFontSize >= MIN_FONT_SIZE && parsedFontSize <= 72
      ? parsedFontSize
      : null;

  const onAdoptFile = useCallback(async (next: File | null) => {
    setFieldMsg(null);
    setFile(next);
    if (!next) return;
    if (next.name.length > MAX_FILENAME_LEN) {
      setFieldMsg('El nombre del archivo es demasiado largo');
      setFile(null);
      return;
    }
    if (next.size > MAX_WATERMARK_BYTES) {
      setFieldMsg(`El archivo supera ${(MAX_WATERMARK_BYTES / (1024 * 1024)).toFixed(0)} MB`);
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

  const onAdoptImage = useCallback((next: File | null) => {
    setImageError(null);
    if (!next) {
      setImage(null);
      return;
    }
    if (next.size > MAX_IMAGE_BYTES) {
      setImageError(`La imagen supera ${(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB`);
      setImage(null);
      return;
    }
    setImage(next);
  }, []);

  const onRemoveImage = useCallback(() => {
    setImage(null);
    setImageError(null);
  }, []);

  const onTextChange = useCallback((value: string) => {
    setText(value);
    if (value.length === 0) {
      setTextError(null);
      return;
    }
    if (value.length > MAX_TEXT_LEN) {
      setTextError(`El texto debe tener como máximo ${MAX_TEXT_LEN} caracteres`);
      return;
    }
    setTextError(null);
  }, []);

  const onFontSizeChange = useCallback((value: string) => {
    setFontSizeText(value);
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setFontSizeError(null);
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setFontSizeError('Indica un número entero');
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (n < MIN_FONT_SIZE || n > 72) {
      setFontSizeError('El tamaño debe estar entre 8 y 72');
      return;
    }
    setFontSizeError(null);
  }, []);

  const onOpacityChange = useCallback((values: number[]) => {
    const v = values[0];
    if (typeof v === 'number') setOpacity(v);
  }, []);

  const textReady = mode !== 'text' || text.trim().length > 0;
  const canSubmit =
    file !== null &&
    textReady &&
    textError === null &&
    imageError === null &&
    fontSizeError === null &&
    (mode !== 'text' || fontSize !== null) &&
    (mode !== 'image' || image !== null) &&
    phase === 'idle';

  const onSubmit = useCallback(async () => {
    if (!file) return;
    if (mode === 'text' && (fontSize === null || text.trim().length === 0)) return;
    if (mode === 'image' && !image) return;
    setFieldMsg(null);
    setPhase('uploading');
    try {
      const result = await submitForWatermark(
        {
          file,
          mode,
          text: text.trim(),
          image,
          position,
          opacity,
          tiltDeg,
          fontSize: fontSize ?? 36,
        },
        setPhase,
      );
      if (result.ok) {
        triggerDownload(result.blob, result.filename);
        const pages = result.pages;
        const note =
          pages !== null
            ? ` (${pages} ${pages === 1 ? 'página' : 'páginas'}, ${humanSize(result.outputBytes)})`
            : '';
        toast.success(`Marca de agua aplicada${note}: ${result.filename}`, {
          description: 'La descarga ha comenzado.',
        });
        history.add({
          id: crypto.randomUUID(),
          inputName: file.name,
          outputName: result.filename,
          outputSizeBytes: result.outputBytes,
          outputFormat: 'PDF',
          kind: 'marca-de-agua-pdf',
        });
      } else {
        if (result.fieldMessage) setFieldMsg(result.fieldMessage);
        toast.error(result.toastMessage);
      }
    } finally {
      setPhase('idle');
    }
  }, [file, mode, text, image, position, opacity, tiltDeg, fontSize, history]);

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
          Marca de agua en PDF
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Sube un PDF y estampa un texto o una imagen en cada página eligiendo{' '}
          <span className="font-medium text-foreground">posición</span>,{' '}
          <span className="font-medium text-foreground">opacidad</span> y{' '}
          <span className="font-medium text-foreground">rotación</span> (-45°, 0° o 45°).{' '}
          <span className="font-medium text-foreground">
            Salida: el mismo PDF con marca de agua
          </span>
          .
        </p>
      </header>

      <Alert className="border-brand-300/60 bg-brand-50/60 text-foreground dark:bg-brand-900/20">
        <AlertTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
          <ImageIcon className="h-4 w-4" aria-hidden />
          Privacidad garantizada
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Tu PDF se procesa en el servidor y{' '}
          <span className="font-medium text-foreground">nunca se guarda en disco</span>. PDF de
          hasta{' '}
          <span className="font-medium text-foreground">
            {(MAX_WATERMARK_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>{' '}
          e imagen de marca de hasta{' '}
          <span className="font-medium text-foreground">
            {(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB
          </span>
          .
        </AlertDescription>
      </Alert>

      <Card className="border-border/60 bg-card/80 shadow-lg">
        <CardHeader>
          <CardTitle>Subir PDF</CardTitle>
          <CardDescription>
            Arrastra un PDF o haz clic para seleccionarlo. Después elige entre estampar un texto o
            una imagen, la posición, la opacidad y la rotación.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Label
            htmlFor="pdf-watermark-input"
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
              o haz clic para seleccionar — máx. {(MAX_WATERMARK_BYTES / (1024 * 1024)).toFixed(0)}{' '}
              MB
            </span>
            <Input
              id="pdf-watermark-input"
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

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Tipo de marca de agua</legend>
            <RadioGroup
              value={mode}
              onValueChange={(v: string) => setMode(v as PdfWatermarkMode)}
              disabled={phase !== 'idle'}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <Label
                htmlFor="pdf-watermark-mode-text"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                  mode === 'text' ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : ''
                }`}
              >
                <RadioGroupItem id="pdf-watermark-mode-text" value="text" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TypeIcon className="h-4 w-4 text-brand-500" aria-hidden /> Texto
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Una cadena (por ejemplo "Confidencial", "Borrador") en cada página.
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="pdf-watermark-mode-image"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                  mode === 'image' ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : ''
                }`}
              >
                <RadioGroupItem id="pdf-watermark-mode-image" value="image" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ImageIcon className="h-4 w-4 text-brand-500" aria-hidden /> Imagen (logo)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Sube un PNG o JPG — se estampa en cada página como marca.
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </fieldset>

          {mode === 'text' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-watermark-text" className="text-sm font-medium text-foreground">
                Texto de la marca de agua
              </Label>
              <Input
                id="pdf-watermark-text"
                type="text"
                autoComplete="off"
                maxLength={MAX_TEXT_LEN + 8}
                placeholder='p. ej. "Confidencial"'
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                disabled={phase !== 'idle'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Hasta {MAX_TEXT_LEN} caracteres. El texto se centra en la posición elegida.
              </p>
              {textError && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {textError}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="pdf-watermark-font-size"
                  className="text-sm font-medium text-foreground"
                >
                  Tamaño de fuente ({fontSize ?? '—'} pt)
                </Label>
                <Input
                  id="pdf-watermark-font-size"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="36"
                  value={fontSizeText}
                  onChange={(e) => onFontSizeChange(e.target.value)}
                  disabled={phase !== 'idle'}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Entero entre {MIN_FONT_SIZE} y 72. Más alto = letra más grande.
                </p>
                {fontSizeError && (
                  <p className="text-xs font-medium text-destructive" role="alert">
                    {fontSizeError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="pdf-watermark-image-input"
                className="text-sm font-medium text-foreground"
              >
                Imagen (PNG o JPG)
              </Label>
              <Input
                id="pdf-watermark-image-input"
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  onAdoptImage(picked);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={phase !== 'idle'}
                className="w-fit gap-2"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" aria-hidden />
                {image ? 'Cambiar imagen' : 'Elegir imagen'}
              </Button>
              {image ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background"
                      aria-hidden="true"
                    >
                      <ImageIcon className="h-5 w-5 text-brand-500" />
                    </span>
                    <span className="truncate font-medium text-foreground">{image.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={phase !== 'idle'}
                    onClick={onRemoveImage}
                    aria-label="Quitar imagen"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sube una imagen. Se estampa escalada a ~35% del lado menor de la página.
                </p>
              )}
              {imageError && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {imageError}
                </p>
              )}
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Posición</legend>
            <RadioGroup
              value={position}
              onValueChange={(v: string) => setPosition(v as PdfWatermarkPosition)}
              disabled={phase !== 'idle'}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {POSITIONS.map((opt) => {
                const id = `pdf-watermark-pos-${opt.value}`;
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

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="pdf-watermark-opacity"
              className="flex items-center justify-between text-sm font-medium text-foreground"
            >
              <span>Opacidad</span>
              <span className="font-mono text-brand-700 dark:text-brand-300">{opacity}%</span>
            </Label>
            <Slider
              id="pdf-watermark-opacity"
              value={[opacity]}
              min={MIN_OPACITY}
              max={100}
              step={1}
              onValueChange={onOpacityChange}
              disabled={phase !== 'idle'}
            />
            <p className="text-xs text-muted-foreground">
              Entre {MIN_OPACITY} (más sutil) y 100 (sólido). El valor actual es {opacity}%.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Rotación</legend>
            <RadioGroup
              value={String(tiltDeg)}
              onValueChange={(v: string) => setTiltDeg(Number(v) as PdfWatermarkTilt)}
              disabled={phase !== 'idle'}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              <Label
                htmlFor="pdf-watermark-tilt-m45"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                  tiltDeg === -45 ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : ''
                }`}
              >
                <RadioGroupItem id="pdf-watermark-tilt-m45" value="-45" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">-45°</span>
                  <span className="text-xs text-muted-foreground">Diagonal arriba-izquierda</span>
                </span>
              </Label>
              <Label
                htmlFor="pdf-watermark-tilt-0"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                  tiltDeg === 0 ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : ''
                }`}
              >
                <RadioGroupItem id="pdf-watermark-tilt-0" value="0" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">0° (sin girar)</span>
                  <span className="text-xs text-muted-foreground">Marca horizontal</span>
                </span>
              </Label>
              <Label
                htmlFor="pdf-watermark-tilt-45"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 ${
                  tiltDeg === 45 ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : ''
                }`}
              >
                <RadioGroupItem id="pdf-watermark-tilt-45" value="45" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">+45°</span>
                  <span className="text-xs text-muted-foreground">Diagonal arriba-derecha</span>
                </span>
              </Label>
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
                value={phase === 'uploading' ? 30 : 90}
                className="h-1.5 w-full bg-brand-100 dark:bg-brand-900/40"
              />
              <p className="text-center text-xs font-medium text-brand-700 dark:text-brand-300">
                {phase === 'uploading'
                  ? 'Subiendo PDF…'
                  : 'Estampando marca de agua en el servidor…'}
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
              ? 'Aplicar marca de agua'
              : phase === 'uploading'
                ? 'Subiendo…'
                : 'Estampando…'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            El PDF puede pesar hasta {(MAX_WATERMARK_BYTES / (1024 * 1024)).toFixed(0)} MB. La marca
            de agua no cambia la cantidad de páginas del PDF.
          </p>
        </CardContent>
      </Card>

      <RecentResultsStrip slug="marca-de-agua-pdf" className="w-full" />
    </main>
  );
}
