# PdfMenep

Transforma archivos sin límites ni complicaciones. Convierte entre formatos, manipula PDFs y procesa imágenes de forma rápida y segura, todo desde el navegador.

## Herramientas

### PDF
- Comprimir PDF
- Dividir PDF
- Combinar (merge) PDFs
- Rotar / recortar páginas
- Eliminar páginas
- Numerar páginas
- Añadir marca de agua
- Firmar PDF
- Proteger con contraseña
- Desbloquear PDF
- Reparar PDF
- Extraer texto
- OCR
- Conversión PDF → Word, PDF → Excel, PDF → JPG

### Imágenes
- Comprimir imágenes
- Convertir formatos de imagen
- JPG → PDF

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- [Tailwind CSS 4](https://tailwindcss.com) y [shadcn/ui](https://ui.shadcn.com)
- [Prisma 6](https://www.prisma.io) con PostgreSQL
- Procesamiento de PDF e imágenes en el servidor (`@cantoo/pdf-lib`, `pdfjs-dist`, `sharp`)
- Validación tipada con [Zod](https://zod.dev) y `@t3-oss/env-nextjs`
- Tests con [Vitest](https://vitest.dev) y lint/format con [Biome](https://biomejs.dev)

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # configura las variables requeridas
npm run dev
```

`npm run dev` y `npm run build` validan `DATABASE_URL` y `NEXT_PUBLIC_APP_URL`. Si no tienes una base de datos para desarrollo, usa `SKIP_ENV_VALIDATION=1 npm run dev`.

### Scripts útiles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Servir el build |
| `npm run lint` | Lint (Biome) |
| `npm run lint:fix` | Lint y auto-corrección |
| `npm run typecheck` | Chequeo de tipos (tsc) |
| `npm run test` | Tests unitarios (Vitest) |
| `npm run db:studio` | Explorador de base de datos (Prisma) |

## Estructura

```text
.
├── prisma/schema/               Esquema de Prisma (datasource + modelos)
├── public/                      Assets estáticos y PWA
├── src/
│   ├── app/
│   │   ├── (custom)/            Rutas de cada herramienta (páginas)
│   │   ├── api/                 Route handlers /api/*
│   │   ├── layout.tsx           Layout raíz
│   │   └── globals.css          Tema y tokens de marca
│   ├── components/
│   │   ├── ui/                  Primitivas shadcn/ui
│   │   └── custom/              Componentes propios de la app
│   ├── lib/
│   │   ├── business/            Lógica de negocio (PDF/imágenes)
│   │   ├── contracts/           Schemas Zod compartidos
│   │   └── ...
│   └── workers/                 Web Workers
├── tests/unit/                  Tests unitarios
├── next.config.ts               Configuración de Next y cabeceras de seguridad
├── next.user-config.ts          Configuración propia de la app
└── proxy.ts                     CSP con nonce por petición
```

## Seguridad

- CSP estricto con nonce por petición y `strict-dynamic`
- Cabeceras de seguridad: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP
- Sin Server Actions: toda mutación pasa por route handlers `/api/*`
- Validación tipada del entorno: los secretos nunca llegan al bundle del cliente

## Licencia

MIT. Ver [LICENSE](./LICENSE).