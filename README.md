# Bawean Menfess

Anonymous community confession platform for Bawean. This repository currently
contains the **D0 project foundation only**; product screens and backend service
integrations are intentionally deferred to later phases.

## Stack

- Next.js App Router, React, and strict TypeScript
- Tailwind CSS
- PostgreSQL on Supabase with Prisma ORM (integration deferred)
- Better Auth (integration deferred)
- Upstash Redis (integration deferred)
- Zod
- Vitest and Playwright
- Vercel deployment target

All direct dependencies are pinned in `package.json`; the lockfile records the
complete dependency graph.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright requires a browser binary before the first full E2E run:

```bash
npx playwright install chromium
```

## Project structure

```text
public/                         Static assets, including the official logo
docs/                           Product and engineering documentation
src/app/                        App Router entry points and global styles
src/components/brand/           Reusable brand primitives
src/config/                     Site-level typed configuration
tests/unit/                     Vitest tests
tests/e2e/                      Playwright tests
```

## Design source

Figma file: <https://www.figma.com/design/l5lV9FukNVG2sIeKoParEg/Untitled>

| Screen | Node |
| --- | --- |
| Desktop Landing | `4:3` |
| Desktop Submit | `8:2` |
| Desktop Tracking | `8:47` |
| Desktop About | `8:89` |
| Mobile Landing | `9:3` |
| Mobile Submit | `9:56` |
| Mobile Tracking | `9:90` |
| Admin Dashboard | `10:3` |
| Admin Login | `10:80` |

The global CSS variables mirror the shared Figma palette, radii, typography,
and layout constants. `public/bawean-menfess-logo.png` is the official
1280×1280 PNG exported from the supplied Figma design; it was not regenerated.
The functional baseline and unresolved product decisions are recorded in
[`docs/PROJECT_SPECIFICATION.md`](docs/PROJECT_SPECIFICATION.md).

## Configuration and prerequisites

- Node.js `>=20.9.0` and npm are required.
- Copy `.env.example` to `.env.local` only when a later phase connects services.
- Never commit real credentials. The example values are placeholders only.
- Resolve the open decisions in `docs/PROJECT_SPECIFICATION.md` before their
  affected behavior is implemented.
- Supabase, Prisma schema/migrations, Better Auth, Upstash, and Vercel project
  setup are intentionally not configured in D0.
