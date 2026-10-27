# Deployment readiness

Audit date: 2026-10-27

## Executive verdict

**NOT READY FOR PUBLIC RELEASE.** The code and local quality gates are ready
for release review, but the production domain is not currently protected and
the production administrator count is zero. The release may proceed only after
the user separately approves the temporary all-deployments protection, the
release commit/push, and first-admin bootstrap described in
[`PRODUCTION_RELEASE_RUNBOOK.md`](PRODUCTION_RELEASE_RUNBOOK.md).

## Readiness matrix

| Area | State | Evidence |
| --- | --- | --- |
| Application implementation | **IMPLEMENTED** | Public submission/tracking, admin-only Better Auth, bootstrap CLI, moderation dashboard/API, transactional audit workflow |
| Prisma schema | **LOCALLY VERIFIED** | `prisma validate` and client generation passed with Prisma 7.10.1 |
| Static quality | **LOCALLY VERIFIED** | ESLint and strict TypeScript passed |
| Unit tests | **LOCALLY VERIFIED** | 43/43 passed |
| PostgreSQL 17 integration | **LOCALLY VERIFIED** | 33/33 passed on disposable PostgreSQL 17; the first container attempt ended during startup, and one bounded clean retry passed |
| Browser E2E | **LOCALLY VERIFIED** | 8/8 Chromium Playwright tests passed with test-only environment values and intercepted public writes |
| Production build | **LOCALLY VERIFIED** | Next.js 16.4.2 Turbopack build passed; all routes compiled |
| Production dependencies | **LOCALLY VERIFIED** | `npm audit --omit=dev`: 0 vulnerabilities |
| Development dependencies | **PENDING CONDITIONAL CONTROL** | Five HIGH entries from one accepted advisory; see `SECURITY_RISK_ACCEPTANCE.md` |
| Secret scan | **LOCALLY VERIFIED** | 100 tracked/untracked release files plus Git patch history scanned; no credential patterns found |
| Supabase project/schema | **PRODUCTION VERIFIED** | Project healthy; PostgreSQL 17.11; D1/D2 applied; schema up to date; five active categories |
| Runtime database role/TLS | **PRODUCTION VERIFIED** | `bawean_app` via port 6543 and `postgres` owner via port 5432 both completed read-only queries with encrypted, authorized TLS |
| Vercel project/Git link | **PRODUCTION VERIFIED** | Correct project/team, GitHub `god1mas/bawean-menfess`, production branch `main`, Next.js preset, repository root |
| Vercel environment metadata | **PRODUCTION VERIFIED** | Six required Production-only variables; five Secret and `BETTER_AUTH_URL` Config; exact URL match verified without printing values |
| Production domain | **PRODUCTION VERIFIED** | `bawean-menfess.vercel.app` is registered and verified |
| Production deployment | **PENDING USER APPROVAL** | No deployments exist |
| Production administrator | **PENDING USER APPROVAL** | Current admin count is 0 |
| Safe public-launch boundary | **BLOCKED** | Protection excludes production/custom domains while automatic domain assignment is enabled |

## Database and security evidence

The local migration SHA-256 values match the approved values and the successful
Prisma history rows:

- D1 `20261021130000_initial_schema`:
  `71fec35ce36addb229654eb83e8779f33db51080ec562fe092a0dd615f60eb8b`
- D2 `20261022130000_add_postgres_rate_limiting`:
  `0c8265fd93526719c8af092a7bb746478be129c63d2807eecc28351544ae3424`

The earlier failed D1 attempt remains correctly marked rolled back, followed by
the successful approved D1 record. Prisma reports two local migrations and an
up-to-date production schema. There is no unexpected migration and no D3
migration requirement for the current code.

Production has the seven D1 tables plus the D2 `rate_limit_bucket`. The runtime
role is LOGIN, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`,
`NOINHERIT`, without memberships, object ownership, schema `CREATE`, or RLS
bypass. It has column-scoped menfess/moderation writes, no audit update/delete/
truncate access, and only `EXECUTE` on the owner-controlled rate-limit function.
All six private functions have empty `search_path`; only the rate-limit function
is `SECURITY DEFINER`. Six moderation/version/audit triggers are enabled.

The Supabase security advisor reports only two expected INFO notices for RLS
with no policies on owner/function-only internal tables. Performance advisor
unused-index notices are expected before application traffic and are not a
reason to remove required indexes.

The committed CA is included by Next.js output file tracing for database-backed
pages and routes. The application adapter removes URL TLS parameters and passes
the CA directly to node-postgres with `rejectUnauthorized: true`; the observed
TLS sockets were encrypted and authorized with no authorization error.

## Vercel evidence and launch blocker

- Project: `bawean-menfess` (`prj_jN3f7KZ88HTw84bQVBQWEBYqs2KB`)
- Team: `team_98mH4ghulBsZJJVm7zEQRj9x`
- Git integration: GitHub `god1mas/bawean-menfess`, production branch `main`
- Framework/root/runtime: Next.js, repository root, Node.js 24.x
- Required Production variables: all six present; five Secret and
  `BETTER_AUTH_URL` Config; no Preview/Development copies and no `DIRECT_URL`
- `BETTER_AUTH_URL`: exact match to
  `https://bawean-menfess.vercel.app`, checked in an isolated process that
  could not read the five Secret values
- Deployment state: none
- Domain: verified
- Protection: Vercel Authentication applies to all except custom/production
  domains; no password/trusted-IP protection; automatic production-domain
  assignment enabled

The connected Vercel app returned HTTP 403 for this team scope. The already
authenticated Vercel CLI provided the current read-only evidence instead. This
connector authorization issue does not alter the project, but it should be
re-authorized before relying on the connector for release monitoring.

The launch blocker and smallest approved-path remedy are documented in the
release runbook: temporarily extend Vercel Authentication protection to the
production domain, keep it through admin bootstrap/login verification, and
remove it only under separate public-launch approval.

## Dependency risk decision

Full `npm audit` reports five HIGH development-only entries in
`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch ->
braces 3.0.3`, all representing `GHSA-vfj7-8cjw-p6xm` /
`CVE-2026-93687`. The owner accepted this risk conditionally on 2026-10-23.
The issue is not fixed or suppressed. Required controls and invalidation
conditions are recorded in
[`SECURITY_RISK_ACCEPTANCE.md`](SECURITY_RISK_ACCEPTANCE.md).

## Git release classification

### INCLUDE IN RELEASE

```text
README.md
docs/ADMINISTRATOR_SETUP.md
docs/ADMIN_BOOTSTRAP.md
docs/D2_IMPLEMENTATION.md
docs/D2_RATE_LIMITING.md
docs/DATABASE_CONNECTION.md
docs/DEPLOYMENT_READINESS.md
docs/MODERATION_WORKFLOW.md
docs/PRISMA_SCHEMA.md
docs/PRODUCTION_RELEASE_RUNBOOK.md
docs/PROJECT_SPECIFICATION.md
docs/SECURITY_RISK_ACCEPTANCE.md
next.config.ts
package-lock.json
package.json
prisma.config.ts
public/bawean-menfess-logo.png
scripts/admin/bootstrap-core.d.mts
scripts/admin/bootstrap-core.mjs
scripts/admin/bootstrap-first-admin.mjs
scripts/test/run-postgres-integration.mjs
src/app/admin/page.tsx
src/app/api/admin/moderation/[id]/route.ts
src/app/api/admin/moderation/route.ts
src/app/api/admin/session/route.ts
src/app/api/auth/[...all]/route.ts
src/app/api/public/categories/route.ts
src/components/admin/moderation-dashboard.tsx
src/lib/admin-moderation-api.ts
src/lib/admin-moderation-service.ts
src/lib/admin-moderation.ts
tests/integration/admin-bootstrap.integration.test.ts
tests/integration/moderation.integration.test.ts
tests/unit/admin-bootstrap.test.ts
tests/unit/admin-moderation-api.test.ts
```

These files form one coherent release: admin authentication/moderation,
operator bootstrap, audit behavior, explicit `pg` dependency, test isolation,
Prisma/TLS and output tracing, official branding, and the associated
documentation. The official logo is the confirmed 1254x1254 asset and is
referenced by the application.

### EXCLUDE FROM RELEASE

```text
public/bawean-menfess-logo1.png
```

This 1280x1280 file is the unapproved alternative logo. Preserve it locally;
do not delete, overwrite, stage, or commit it. Ignored `.env.local`, `.vercel`,
`.next`, `node_modules`, Playwright reports, test results, and generated Prisma
client files are also excluded.

### REQUIRES USER REVIEW

No unexplained file remains outside the two classifications above. The entire
include manifest and diff still require user approval before staging.

Suggested commit message:

```text
feat: complete admin moderation and production release preparation
```

## Remaining gates

1. Approve and enable temporary production-domain protection.
2. Review and approve the exact commit manifest and diff.
3. Separately approve commit and push/deployment actions.
4. Separately approve first production administrator creation.
5. Verify admin login/moderation under protection.
6. Separately approve public launch by relaxing protection.

No production mutation was performed during this audit.
