'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Segment } from '@/lib/nav';

// ── Hero background gradient mesh ────────────────────────────────────────────

function HeroMesh() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {/* Radial warm glow — top-left */}
      <div className="absolute -left-32 -top-24 size-[40rem] rounded-full bg-brand-200/30 blur-3xl" />
      {/* Mid-page warmth */}
      <div className="absolute left-1/3 top-1/2 size-[28rem] rounded-full bg-brand-400/10 blur-3xl" />
      {/* Accent dot — bottom-right */}
      <div className="absolute bottom-0 right-0 size-[20rem] rounded-full bg-brand-500/20 blur-3xl" />
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '3rem 3rem',
        }}
      />
    </div>
  );
}

// ── Feature icons (inline SVG) ────────────────────────────────────────────────

function IconShield({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Escudo de privacidad</title>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconZap({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Conversión rápida</title>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconBatch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Procesamiento por lotes</title>
      <rect x="2" y="3" width="6" height="6" rx="1" />
      <rect x="10" y="3" width="6" height="6" rx="1" />
      <rect x="18" y="3" width="4" height="6" rx="1" />
      <rect x="2" y="13" width="6" height="6" rx="1" />
      <rect x="10" y="13" width="6" height="6" rx="1" />
      <path d="M20 13v4a2 2 0 0 0 2-2V9" />
      <path d="M20 17a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2" />
    </svg>
  );
}

function IconFileText({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Documento</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconImage({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Imagen</title>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Verificado</title>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Flecha</title>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ── Feature row component ──────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: IconShield,
    title: 'Privacidad garantizada',
    desc: 'Tus archivos se procesan localmente. Nunca suben a servidores externos, manteniendo tu información bajo tu control total.',
  },
  {
    icon: IconZap,
    title: 'Sin marcas de agua',
    desc: 'Los archivos convertidos son tuyos al 100%. Sin marcas de agua, sin limitaciones severas de tamaño.',
  },
  {
    icon: IconBatch,
    title: 'Procesamiento por lotes',
    desc: 'Maneja volúmenes significativos de documentos en una sola operación. Eficiente para profesionales y empresas.',
  },
  {
    icon: IconFileText,
    title: 'Conversión múltiple',
    desc: 'Convierte entre múltiples formatos de documento, manipula PDFs, extrae texto y mucho más.',
  },
  {
    icon: IconImage,
    title: 'Procesamiento de imágenes',
    desc: 'Optimiza, redimensiona y convierte imágenes de forma rápida y segura, sin herramientas externas.',
  },
  {
    icon: IconCheck,
    title: 'Planes accesibles',
    desc: 'Comienza con un modelo gratuito generoso. Actualiza a planes premium cuando necesites funciones avanzadas.',
  },
];

// ── Segment-aware landing wiring ──────────────────────────────────────────────

const DEFAULT_SEGMENT: Segment = 'pymes';

type SegmentCard = { label: string; href: string; description: string };

const SEGMENTS: Record<Segment, { subHeadline: string; firstCard: SegmentCard }> = {
  pymes: {
    subHeadline:
      'Para tu equipo: combina, divide y transforma archivos en segundos, sin subir nada a la nube y sin marcas de agua.',
    firstCard: {
      label: 'Unir PDFs',
      href: '/pdf-merge',
      description: 'Combina facturas, contratos y reportes en un solo PDF.',
    },
  },
  freelancers: {
    subHeadline:
      'Entrega propuestas, portafolios y entregables en PDF profesional — rápido, sin marcas de agua y sin registro.',
    firstCard: {
      label: 'JPG a PDF',
      href: '/jpg-a-pdf',
      description: 'Entrega propuestas, portafolios y entregables en PDF profesional.',
    },
  },
  creadores: {
    subHeadline:
      'Extrae y transforma imágenes de catálogos y moodboards para tus redes y portafolio, directamente desde tu navegador.',
    firstCard: {
      label: 'PDF a JPG',
      href: '/pdf-a-jpg',
      description: 'Extrae imágenes de catálogos y moodboards para tus redes y portafolio.',
    },
  },
};

const SECOND_CARD: SegmentCard = {
  label: 'Conversor de imágenes',
  href: '/image-convert',
  description: 'Convierte entre formatos de imagen sin perder calidad.',
};

const THIRD_CARD: SegmentCard = {
  label: 'Comprimir imágenes',
  href: '/comprimir-imagenes',
  description: 'Reduce el peso de tus imágenes para web y correo.',
};

const STORAGE_KEY = 'pdfmenep_segment';

function readStoredSegment(): Segment | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'pymes' || v === 'freelancers' || v === 'creadores') return v;
  } catch {
    // localStorage unavailable (private mode, sandbox) — ignore.
  }
  return null;
}

function detectSegmentFromSignals(): Segment | null {
  if (typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search);
  const haystack = [
    search.get('utm_source'),
    search.get('utm_medium'),
    search.get('utm_campaign'),
    typeof document !== 'undefined' ? document.referrer : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack) return null;
  if (/(pymes|pyme|smb)/.test(haystack)) return 'pymes';
  if (/(freelanc|free|independiente|upwork|fiverr)/.test(haystack)) return 'freelancers';
  if (
    /(creador|creadores|creator|design|behance|dribbble|instagram|tiktok|pinterest)/.test(haystack)
  ) {
    return 'creadores';
  }
  return null;
}

function useSegment(): [Segment, (next: Segment) => void] {
  const [segment, setSegment] = useState<Segment>(DEFAULT_SEGMENT);

  useEffect(() => {
    // mount-only — read once from window/localStorage; subsequent updates happen via setSegment.
    const stored = readStoredSegment();
    const detected = stored ?? detectSegmentFromSignals();
    setSegment((prev) => (detected && detected !== prev ? detected : prev));
  }, []);

  const handleSetSegment = useCallback((next: Segment) => {
    setSegment(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / private-mode failures
    }
  }, []);

  return [segment, handleSetSegment];
}

// ── Landing content (all interactive/animation-aware parts) ──────────────────

function EmpezarCard({ card }: { card: SegmentCard }) {
  return (
    <a
      href={card.href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full border-border/60 bg-card/60 transition-all duration-200 hover:border-brand-300 hover:bg-card group-hover:shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold leading-snug">{card.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm leading-relaxed">{card.description}</CardDescription>
        </CardContent>
      </Card>
    </a>
  );
}

const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'pymes', label: 'Soy Pyme' },
  { value: 'freelancers', label: 'Soy Freelancer' },
  { value: 'creadores', label: 'Soy Creador' },
];

export function LandingContent() {
  const [segment, setSegment] = useSegment();
  const firstCard = SEGMENTS[segment].firstCard;
  const subHeadline = SEGMENTS[segment].subHeadline;
  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92vh] flex-col justify-center px-gutter pt-8">
        <HeroMesh />
        <div className="container-page">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="mb-6 text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
            >
              Procesamiento local · Sin marcas de agua
            </Badge>

            <h1 className="font-display text-[2.75rem] font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.75rem] text-foreground">
              Transforma archivos
              <br />
              <span className="text-brand-500">sin límites</span>
              <br />
              ni complicaciones
            </h1>

            <p className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">{subHeadline}</p>

            {/* Empezar con — segment-aware curated row */}
            <div className="mt-10">
              <p className="text-eyebrow mb-3">Empezar con</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <EmpezarCard card={firstCard} />
                <EmpezarCard card={SECOND_CARD} />
                <EmpezarCard card={THIRD_CARD} />
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="gap-2 text-base font-semibold">
                <a href="mailto:contacto@pdfmenep.com">
                  Empezar ahora
                  <IconArrowRight className="size-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base">
                <a href="/#caracteristicas">Saber más</a>
              </Button>
            </div>

            {/* Soy… selector — persists choice locally */}
            <fieldset className="mt-8">
              <legend className="sr-only">Elige tu perfil</legend>
              <div className="flex flex-wrap items-center gap-2">
                {SEGMENT_OPTIONS.map((opt) => {
                  const active = segment === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      onClick={() => setSegment(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tu elección se guarda en este navegador.
              </p>
            </fieldset>
          </div>
        </div>

        {/* Hero visual — abstract file-transform graphic */}
        <div className="container-page mt-12">
          <div className="flex items-center gap-4 overflow-hidden rounded-xl border border-border bg-card/80 p-6 shadow-lg sm:gap-8">
            {/* Source file card */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-100 text-brand-600 sm:h-20 sm:w-20">
                <IconFileText className="size-8 sm:size-10" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">DOCX</span>
            </div>

            <div className="flex grow flex-col items-center gap-1">
              <div className="flex items-center gap-2 text-sm font-medium text-brand-600">
                <IconZap className="size-4" />
                <span>convirtiendo…</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-2 w-3/4 rounded-full bg-brand-500" />
              </div>
            </div>

            {/* Target file card */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-500 text-brand-foreground sm:h-20 sm:w-20">
                <IconFileText className="size-8 text-brand-foreground sm:size-10" />
              </div>
              <span className="text-xs font-medium text-brand-600">PDF</span>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── TRUST BAR ─────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted/30">
        <div className="container-page py-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: 'Procesamiento 100% local' },
              { label: 'Sin marcas de agua' },
              { label: 'Soporte por lotes' },
              { label: 'Privacidad garantizada' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <IconCheck className="size-4 shrink-0 text-brand-500" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CARACTERÍSTICAS ───────────────────────────────────────────────── */}
      <section id="caracteristicas" className="section">
        <div className="container-page">
          <div className="mb-12 max-w-xl">
            <p className="text-eyebrow mb-3">Características</p>
            <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
              Todo lo que necesitas para transformar tus archivos
            </h2>
            <p className="mt-4 text-muted-foreground">
              PdfMenep combina potencia, simplicidad y privacidad en una sola herramienta. Sin
              importar el volumen o el formato, tienes todo bajo control.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="group lift border-border/60 bg-card/60 transition-all duration-200 hover:border-brand-300 hover:bg-card"
              >
                <CardHeader className="flex flex-row items-start gap-4 pb-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 group-hover:bg-brand-500 group-hover:text-brand-foreground transition-colors duration-200">
                    <f.icon className="size-5" />
                  </div>
                  <CardTitle className="text-base font-semibold leading-snug">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">{f.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ────────────────────────────────────────────────── */}
      <section id="como-funciona" className="section bg-muted/20">
        <div className="container-page">
          <div className="mb-12 max-w-xl">
            <p className="text-eyebrow mb-3">Proceso</p>
            <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
              Tres pasos para convertir tus archivos
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sube tu archivo, selecciona el formato de salida y descarga el resultado. Así de
              simple.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Sube tu archivo',
                desc: 'Selecciona el archivo que necesitas convertir. Soportamos una amplia variedad de formatos de documento e imágenes.',
              },
              {
                step: '02',
                title: 'Elige el formato',
                desc: 'Indica el formato de salida deseado. Convierte entre múltiples opciones según tus necesidades.',
              },
              {
                step: '03',
                title: 'Descarga el resultado',
                desc: 'Recibe tu archivo convertido en segundos, listo para usar, sin marcas de agua ni restricciones.',
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-4xl font-bold tracking-tight text-brand-300">
                    {item.step}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────────────────────── */}
      <section className="section-lg">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-16 text-center shadow-xl">
            {/* Background accent glow */}
            <div
              className="absolute -bottom-24 left-1/2 -translate-x-1/2 size-[28rem] rounded-full bg-brand-200/20 blur-3xl"
              aria-hidden
            />

            <div className="relative">
              <Badge
                variant="outline"
                className="mb-6 text-xs font-medium tracking-wide text-brand-600 border-brand-300/60 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400"
              >
                Plan gratuito disponible
              </Badge>
              <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
                Empieza a convertir hoy mismo
              </h2>
              <p className="mt-4 max-w-md mx-auto text-muted-foreground">
                Sin registro obligatorio, sin costos ocultos. Solo necesitas tu archivo y un
                objetivo claro.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Button asChild size="lg" className="gap-2 text-base font-semibold">
                  <a href="mailto:contacto@pdfmenep.com">
                    Contactar
                    <IconArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                ¿Preguntas? Escríbenos a{' '}
                <a
                  href="mailto:contacto@pdfmenep.com"
                  className="underline underline-offset-2 hover:text-brand-600 transition-colors"
                >
                  contacto@pdfmenep.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
