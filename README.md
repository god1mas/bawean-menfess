# Bawean Menfess

Anonymous community confession platform for Bawean. The repository contains
the deployed D1 schema and D2 rate-limiting migration, anonymous submission
and tracking, and a provisioned-admin-only moderation dashboard. No production
application deployment exists yet.

## Stack

- Next.js App Router, React, and strict TypeScript
- Tailwind CSS
- PostgreSQL on Supabase with Prisma ORM (deployed schema; migration history verified)
- Better Auth for provisioned administrators only (public signup and social login disabled)
- PostgreSQL-backed fixed-window rate limiting in the private Supabase schema
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
npm run test:postgres
npm run build
npm run test:e2e
```

`npm run test:postgres` provisions a disposable PostgreSQL 17 container,
applies the reviewed D1 and D2 migrations plus isolated fixtures, and removes
the container afterwards. It strips production database/auth settings from the
test process. Docker Desktop must be running.

Playwright requires a browser binary before the first full E2E run:

```bash
npx playwright install chromium
```

## Project structure

```text
public/                         Static assets, including the official logo
docs/                           Product and engineering documentation
prisma/                         Prisma schema and deployed migration history
src/app/                        App Router entry points and global styles
src/components/brand/           Reusable brand primitives
src/config/                     Site-level typed configuration
src/lib/                        Server-only auth, authorization, database, and public API modules
tests/unit/                     Vitest tests
tests/integration/              Disposable PostgreSQL 17 integration tests
tests/e2e/                      Playwright tests
```

## Administrator authentication

Only users whose database `auth_user.role` is `admin` can start an authenticated
session. Public signup, visitor login, and social providers are disabled.
Admin authorization reads the role from PostgreSQL for each protected request;
browser-provided role values are not authoritative. The Better Auth API route
exposes only email sign-in, sign-out, and a minimized session response. A
one-time interactive CLI provides offline first-admin bootstrap; review
[`docs/ADMINISTRATOR_SETUP.md`](docs/ADMINISTRATOR_SETUP.md) and obtain explicit
operational approval before targeting production.

Set `BETTER_AUTH_SECRET` to a randomly generated value of at least 32 bytes and
`BETTER_AUTH_URL` to the application's origin. Production requires an HTTPS
origin. Keep both values server-side and never commit real credentials.

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
1254×1254 PNG and must be preserved as supplied.
The functional baseline and unresolved product decisions are recorded in
[`docs/PROJECT_SPECIFICATION.md`](docs/PROJECT_SPECIFICATION.md).

## Configuration and prerequisites

- Node.js `>=22.0.0` and npm are required.
- Copy `.env.example` to `.env.local` and keep all real values local or in the
  deployment secret store.
- Never commit real credentials. The example values are placeholders only.
- Resolve the open decisions in `docs/PROJECT_SPECIFICATION.md` before their
  affected behavior is implemented.
- The Supabase database connection plan and Task 1.2 verification are recorded
  in [`docs/DATABASE_CONNECTION.md`](docs/DATABASE_CONNECTION.md).
- The Task 1.3A Prisma and Better Auth schema review is recorded in
  [`docs/PRISMA_SCHEMA.md`](docs/PRISMA_SCHEMA.md).
- The provisioned least-privilege `bawean_app` runtime role, unapplied object
  grants, and verification procedure are recorded in
  [`docs/RUNTIME_DATABASE_ROLE.md`](docs/RUNTIME_DATABASE_ROLE.md).
- The read-only Supabase `PUBLIC` privilege inventory and Gate D decision are
  recorded in
  [`docs/SUPABASE_PRIVILEGE_AUDIT.md`](docs/SUPABASE_PRIVILEGE_AUDIT.md).
- The D2 public API, tracking-security, UI, and deployment boundary are
  recorded in [`docs/D2_IMPLEMENTATION.md`](docs/D2_IMPLEMENTATION.md).
- The administrator bootstrap procedure and moderation lifecycle are recorded
  in [`docs/ADMINISTRATOR_SETUP.md`](docs/ADMINISTRATOR_SETUP.md) and
  [`docs/MODERATION_WORKFLOW.md`](docs/MODERATION_WORKFLOW.md).
- Verified production state and remaining release gates are recorded in
  [`docs/DEPLOYMENT_READINESS.md`](docs/DEPLOYMENT_READINESS.md).
- The conditionally accepted development-tool vulnerability and mandatory
  controls are recorded in
  [`docs/SECURITY_RISK_ACCEPTANCE.md`](docs/SECURITY_RISK_ACCEPTANCE.md).
- The non-executed first-production deployment, smoke-test, launch-protection,
  and incident procedures are recorded in
  [`docs/PRODUCTION_RELEASE_RUNBOOK.md`](docs/PRODUCTION_RELEASE_RUNBOOK.md).

## Production release status

The application has no Vercel deployment and no production administrator. The
production domain must remain protected during the first deployment and admin
verification; see the release runbook for the approval-gated sequence. Database
readiness and configured environment variables do not authorize deployment or
public launch.
