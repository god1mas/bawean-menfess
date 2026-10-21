# Bawean Menfess — Prisma Schema Review

## Scope

This document records the D1 Task 1.3A schema design. The approved initial SQL
migration was deployed during D1.3F-R4 after isolated PostgreSQL 17 testing
and separate live approval. D1.4–D1.6 added server-side Better Auth and
admin-only authentication. No seed data or production administrator account
was created by those tasks.

## Prisma and connection configuration

- Prisma CLI and Client are pinned to `7.10.1`.
- `prisma.config.ts` loads ignored `.env.local` when present, supplies
  `DIRECT_URL` only to Prisma CLI operations, and enforces `verify-full` with
  the committed public CA even when the stored URL has no TLS query options.
- Application code uses `DATABASE_URL` through `@prisma/adapter-pg` `7.10.1`.
- Runtime TLS uses the committed public Supabase CA with
  `rejectUnauthorized: true`; URL TLS parameters are removed before the
  explicit driver TLS object is supplied so they cannot replace it.
- The runtime pool starts at one connection per server instance and never
  exports a credential to client code.
- All application and Better Auth entities map to `app_private`.

## Better Auth compatibility

The core `User`, `Session`, `Account`, and `Verification` models were generated
with Better Auth's official `auth` CLI at the installed `1.7.12` version using
the Prisma/PostgreSQL adapter options. UUID generation was selected through
`advanced.database.generateId: "uuid"`, and the server-owned `role` additional
field was generated with a nonprivileged `none` default and `input: false`.

The generated model and field names are retained. The reviewed adaptations are:

- `app_private` schema placement and snake_case physical mappings;
- PostgreSQL UUID and `timestamptz` native types;
- expiry indexes and a provider/account compound uniqueness constraint;
- the `User.moderationLogs` domain relation; and
- database checks limiting `role` to `none` or `admin`.

These changes do not alter Better Auth's Prisma-facing field names. D1.4–D1.6
implemented Better Auth configuration, routes, and session handling.
Administrator provisioning remains out of scope.

## Domain constraints and privacy

- `Menfess` has no visitor or sender identity relation.
- Human-readable codes and URL tokens use separate, uniquely indexed
  HMAC-SHA-256 digest columns and independent positive key versions. Plaintext
  credentials have no database column.
- The only stored states are `PENDING`, `APPROVED`, `REJECTED`, and
  `PUBLISHED`. SQL checks admit only the three approved transitions.
- Moderation logs require an actor `User`, before/after states, action,
  timestamp, and unique idempotency key. Insert and deferred constraint
  triggers require the actor's exact `admin` role, match the log to the
  resulting menfess state, require one log for every transition, and reject log
  updates, deletes, and truncation. Server authorization remains mandatory.
- Optimistic locking uses the nonnegative `Menfess.version` field. The future
  service transaction must update by `id`, current status, and version, then
  increment the version and append its log atomically. Database triggers reject
  version-only changes and require exactly one increment per status change.
- Manual Instagram publication is represented only by `publishedAt` and an
  optional `publicationReference`; both are restricted to `PUBLISHED` rows and
  no publishing API integration is implied.
- The migration revokes `app_private` access from `PUBLIC`, `anon`,
  `authenticated`, and `service_role`. A dedicated least-privileged runtime
  database role and its grants must be finalized before production deployment.

The five approved categories are defined in the architecture document but are
not inserted by this migration because Task 1.3A prohibits seeding.

## Unresolved product decisions

The migration intentionally omits the optional Figma pseudonym. Its maximum
length, moderation, publication, and retention rules still require approval.
Tracking presentation/entropy details, retention and recovery, rejection copy,
administrator provisioning/MFA, reversal workflows, and whether an Instagram
reference is mandatory also remain unresolved as listed in
`DATABASE_ARCHITECTURE.md`. No defaults for those product choices were added.

## Migration review boundary

The migration SQL is generated from an empty database and then augmented with
named checks, transition guards, append-only audit enforcement, and
private-schema privilege revocations. The partial pending-queue index remains
deferred until query plans show it should replace or complement the general
status index. The migration must be reviewed and approved before `prisma
migrate deploy` is allowed against the dedicated Bawean Menfess database. It
must never be applied to the Sungairujing Marketplace database.

## D1 Task 1.3B audit corrections

The pre-migration audit made these review-only corrections before any SQL was
applied:

- wrapped the PostgreSQL migration in `BEGIN`/`COMMIT` so DDL and revocations
  succeed or roll back together;
- changed schema creation to fail if an unexpected `app_private` schema already
  exists instead of silently adopting it;
- added a unique menfess/action audit key, transition-to-log consistency checks,
  administrator-actor validation, and version mutation protection;
- restricted publication references to published rows;
- explicitly marked trigger functions `SECURITY INVOKER` and revoked privileges
  on types as well as routines, tables, sequences, and the schema; and
- marked the Prisma module `server-only` to prevent accidental client imports.

PostgreSQL's built-in `PUBLIC` defaults for future routines and types cannot be
removed with a schema-scoped default-privilege revoke. Future migrations must
therefore revoke those privileges in the same transaction. A global default
change was intentionally avoided because it would affect unrelated schemas.

Task 1.3E provisioned the approved dedicated non-owner LOGIN role
`bawean_app` and changed the ignored local runtime connection away from the
`postgres` migration owner. D1.3F-R4 deployed the approved migration and its
object grants after separate approval. The initial migration intentionally
does not create or alter the LOGIN credential. The minimum grant matrix is:

| Object | Required privileges |
| --- | --- |
| `app_private` schema and enum types | `USAGE` only; never schema `CREATE` or ownership |
| `category` | `SELECT` |
| `menfess` | `SELECT`; column-level submission `INSERT`; column-level status/version/publication `UPDATE` |
| `moderation_log` | `SELECT`; column-level `INSERT`; never `UPDATE`, `DELETE`, `TRUNCATE`, or `TRIGGER` |
| `auth_user` | `SELECT`; profile/auth column `UPDATE`; never runtime `INSERT`, `DELETE`, or `role` update |
| `auth_session` | `SELECT`, `INSERT`, `DELETE`; mutable-field column `UPDATE` |
| `auth_account` | `SELECT`, `INSERT`, `DELETE`; token/password/expiry column `UPDATE` |
| `auth_verification` | `SELECT`, `INSERT`, `DELETE` |
| Sequences and trigger functions | no runtime grant |

The runtime role must not own these objects, inherit from `postgres` or another
privileged Supabase role, receive schema `CREATE`, or use the migration
credential. Public signup remains disabled and administrator provisioning must
use a later, separately approved owner workflow. The full column list,
password-rotation procedure, Supabase `PUBLIC`-grant limitation, and read-only
verification queries are documented in
[`RUNTIME_DATABASE_ROLE.md`](RUNTIME_DATABASE_ROLE.md).
