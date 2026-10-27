# Bawean Menfess — Database Connection

## 1. Task status

This section and the verification snapshot in §5 preserve the historical
Task 1.2 state, before D1/D2 were applied. The current read-only verified
production status is recorded in [`DEPLOYMENT_READINESS.md`](DEPLOYMENT_READINESS.md).

- Task: D1 Task 1.2 — Supabase connection preparation
- Supabase project: `bawean-menfess`
- Project reference: `hqupjaaagwpafeuwyixe`
- Region: Singapore (`ap-southeast-1`)
- PostgreSQL: 17.11
- Project status: `ACTIVE_HEALTHY`
- Checked: 21 October 2026

No schema, table, migration, authentication entity, administrator account, or
production record was created by this task.

## 2. Connection modes

| Purpose | Environment variable | Supported mode | Port | Network |
| --- | --- | --- | ---: | --- |
| Next.js/Vercel runtime | `DATABASE_URL` | Shared Supavisor transaction pooler | 6543 | IPv4 |
| Prisma CLI/migrations, preferred | `DIRECT_URL` | Direct PostgreSQL | 5432 | IPv6 unless the paid IPv4 add-on is enabled |
| Prisma CLI/migrations, fallback | `DIRECT_URL` | Shared Supavisor session pooler | 5432 | IPv4 |

Transaction mode is appropriate for short-lived serverless instances but does
not support prepared statements. Its URL therefore includes
`pgbouncer=true`. All connection forms require certificate and hostname
verification with `sslmode=verify-full` and the committed public Supabase root
CA.

The shared pooler hostname includes a cluster index and must be copied exactly
from the Supabase Dashboard **Connect** dialog. It must not be inferred from the
region.

## 3. Environment configuration

The committed `.env.example` contains credential-free URL shapes for this
project. The actual values belong only in ignored `.env.local` or deployment
secret storage:

```dotenv
DATABASE_URL="postgresql://bawean_app.hqupjaaagwpafeuwyixe:<runtime-role-password>@<exact-pooler-host>:6543/postgres?pgbouncer=true&sslmode=verify-full&sslrootcert=certificates/supabase-prod-ca-2021.crt"
DIRECT_URL="postgresql://postgres:<password>@db.hqupjaaagwpafeuwyixe.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=certificates/supabase-prod-ca-2021.crt"
```

On an IPv4-only workstation, use the exact session-pooler URL for `DIRECT_URL`:

```dotenv
DIRECT_URL="postgresql://postgres.hqupjaaagwpafeuwyixe:<password>@<exact-pooler-host>:5432/postgres?sslmode=verify-full&sslrootcert=certificates/supabase-prod-ca-2021.crt"
```

`DATABASE_URL` deliberately authenticates as the non-owner `bawean_app` role.
Shared Supavisor pooler usernames have the form
`<role>.<project-reference>`. `DIRECT_URL` remains the migration-owner
connection and must never be used by application runtime code.

No database URL or database password may use a `NEXT_PUBLIC_` prefix. This
project does not need a browser Supabase key for the planned Prisma-only data
path.

## 4. Prisma 7 requirements

Prisma 7 uses the CLI datasource URL from root-level `prisma.config.ts`, not a
`url` or `directUrl` field in `schema.prisma`. When schema implementation is
approved, the configuration must load `DIRECT_URL` explicitly:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
```

The Prisma native PostgreSQL connector uses its own documented TLS URL dialect:
`prisma.config.ts` converts the stored libpq-style URL to `sslmode=require`,
`sslaccept=strict`, and `sslcert=certificates/supabase-prod-ca-2021.crt`.
Together these require encryption and strict validation against the pinned CA;
the relative path also avoids native-engine path encoding differences on
Windows. A 30-second connection timeout accommodates the shared session
pooler's observed connection latency without weakening TLS.

Runtime Prisma Client uses `@prisma/adapter-pg` with `DATABASE_URL`. The
underlying `pg` pool should start at `max: 1` per serverless instance and use a
finite connection timeout. Node-postgres reads `sslrootcert` and performs its
normal CA and hostname validation when `sslmode=verify-full` is used. If the
future adapter supplies an `ssl` object instead, it must load the same CA and
retain `rejectUnauthorized: true`; TLS parameters must then be removed from the
URL so node-postgres does not replace the explicit object. Prisma 7 requires an
explicit generated-client output path and a driver adapter. Task 1.3A added
these implementation files and the approved initial migration, which was
deployed during D1.3F-R4. The committed CA file is used directly by both runtime
and CLI TLS configuration; it is explicitly included in server traces.
Task 1.2 itself created no Prisma schema or migration.

## 5. Verification evidence

Independent read-only SQL transactions through `DATABASE_URL` and `DIRECT_URL`
returned:

- Database: `postgres`
- PostgreSQL server: `17.11`
- Client-to-Supavisor socket encrypted: `true`
- Certificate authorized: `true`
- Certificate authorization error: `null`
- Hostname verified: `true`
- `app_private` exists: `false`
- Application tables in `public` or `app_private`: none

The absent `app_private` schema is expected. Creating it is a DDL change and is
outside Task 1.2.

The direct database endpoint requires IPv6 on this project. The verified local
`DIRECT_URL` therefore uses the supported shared session pooler fallback on
port 5432. No IPv4 add-on was provisioned.

For pooled connections, `pg_stat_ssl` describes Supavisor's separate backend
connection to PostgreSQL, not the application's client-to-Supavisor socket. A
`false` value therefore does not contradict the verified client TLS state. The
client boundary was checked from node-postgres using `encrypted`, `authorized`,
`authorizationError`, and Node's standard hostname verifier.

## 6. Security controls

- `.env*` is ignored; only `.env.example` is allowed in Git.
- Actual passwords and URLs must not be printed, logged, copied into issue
  trackers, or committed.
- Database variables remain server-only.
- The committed `certificates/supabase-prod-ca-2021.crt` is a public trust
  anchor, not a secret and not a client certificate or private key.
- The Supabase Root 2021 CA SHA-256 fingerprint is
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- Insecure TLS overrides such as `rejectUnauthorized: false` and
  `NODE_TLS_REJECT_UNAUTHORIZED=0` are prohibited.
- The planned `app_private` schema is not exposed through the Data API.
- Supabase Auth is not used; Better Auth remains the future administrator
  identity provider.
- Node.js 22 or later is required. The verified local runtime is Node 24.

## 7. Certificate provenance

Supabase documents `verify-full` with the project certificate downloaded from
the Dashboard's **Database Settings > SSL Configuration**. The public
`Supabase Root 2021 CA` used here was obtained over verified HTTPS from
Supabase's certificate distribution endpoint, inspected as a CA certificate,
and cryptographically validated against both live pooler certificate chains.
It is valid from 28 April 2021 through 26 April 2031.
