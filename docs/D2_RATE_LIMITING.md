# D2 PostgreSQL rate limiting

## Status and approval boundary

Read-only verification confirmed
`prisma/migrations/20261022130000_add_postgres_rate_limiting/migration.sql`
was applied to the dedicated production database and its migration checksum
matches the reviewed value. D2 has five active production categories. The
production application deployment itself has not been confirmed. The
historical policy and security rationale below are retained for operations.

The approved D1 initial migration remains unchanged at SHA-256
`71fec35ce36addb229654eb83e8779f33db51080ec562fe092a0dd615f60eb8b`.

## D2.1 security audit finding

Supabase Security Advisor reported that `public._prisma_migrations` has RLS
disabled. Direct ACL inspection found a more important underlying issue:
`anon`, `authenticated`, and `service_role` currently have every table
privilege on the Prisma migration-history table, granted by `postgres` through
Supabase's public-schema defaults. This exposes migration metadata and permits
unauthorized mutation of migration history through database roles intended for
the Data API.

The migration therefore revokes all access to that exact table from
`PUBLIC`, `anon`, `authenticated`, `service_role`, and `bawean_app`, then enables
RLS with no policies. The `postgres` owner used by `DIRECT_URL` retains its
owner rights, so Prisma Migrate remains compatible. No application table,
Prisma migration row, or existing production datum is changed by this
hardening. This grant hardening is part of the approved D2 migration.

## Chosen algorithm

Use a fixed window per endpoint scope and HMAC-derived client identifier:

| Scope | Applied policy | Window |
| --- | ---: | ---: |
| Anonymous submission | 5 requests | 60 minutes |
| Tracking lookup | 30 requests | 10 minutes |
| Administrator email/password sign-in | 5 attempts | 15 minutes |

These values are initial product-policy limits, not security invariants.
Changing them requires a reviewed function migration. Shared NAT and
mobile carrier users may share a bucket, so production metrics should be used
to tune them after launch.

Fixed windows are selected because a single PostgreSQL upsert provides exact,
atomic enforcement with low storage and query cost. A sliding window gives
smoother boundaries but requires more rows or more complex state. A token
bucket gives better burst semantics but adds time-based arithmetic and more
edge cases. Neither additional complexity is justified for the MVP.

Windows are aligned to Unix-epoch boundaries. A client can therefore consume
one full allowance immediately before a boundary and another immediately after
it: up to 10 submissions or 60 tracking lookups can occur in a very short
interval around the respective boundary. This fixed-window boundary burst is
accepted for the MVP. It must be reconsidered if production abuse data shows
that the burst materially weakens protection.

## Database objects

The migration adds only:

1. a privilege/RLS hardening change for `public._prisma_migrations`;
2. `app_private.rate_limit_bucket`, keyed by scope, HMAC key version,
   32-byte identifier digest, and window start;
3. `rate_limit_bucket_expires_at_idx` for cleanup; and
4. `app_private.consume_rate_limit(text, bytea, smallint)`.

No plaintext address, user identifier, message, or tracking credential is
stored in the limiter. The server will normalize the trusted client address and
derive `HMAC-SHA-256(RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1, normalizedAddress)`.
The independent key must contain at least 32 random bytes and must never reuse
a tracking or Better Auth secret.

`RateLimitBucket` remains represented in `prisma/schema.prisma` so Prisma can
validate and diff the table definition, but the model is marked `@@ignore`.
This excludes it from generated Prisma Client CRUD. Application access must use
only the reviewed `consume_rate_limit` database function.

## Concurrency guarantee

The function calculates one canonical fixed-window key and executes one
`INSERT ... ON CONFLICT DO UPDATE`. PostgreSQL's unique primary-key conflict
handling takes a row lock and serializes simultaneous increments for that
bucket. The first denied request advances the counter from `limit` to
`limit + 1`. Later denied requests match the conflict row but fail the
`DO UPDATE ... WHERE request_count <= limit` predicate, so PostgreSQL returns
no row and does not create another updated row version. The function detects
that no-row result and returns `allowed = false`, zero remaining requests, and
the current window's retry delay. There is no SELECT-then-INSERT race and the
counter cannot grow without bound.

Each call is one short statement/transaction. It performs no network calls and
acquires no advisory or table-level lock. Cleanup uses `FOR UPDATE SKIP LOCKED`
and cannot wait behind cleanup performed by another invocation.

If PostgreSQL or the function is unavailable, public endpoints must fail closed
with a generic `503` and must not perform the protected operation.

## Privileges and function security

- `bawean_app` receives no table privilege on `rate_limit_bucket`.
- `PUBLIC`, `anon`, `authenticated`, `service_role`, and `bawean_app` have all
  direct table privileges revoked.
- The table has RLS enabled with no policies as defense in depth.
- The function is `SECURITY DEFINER` because its caller cannot access the
  backing table. It uses `SET search_path = ''` and schema-qualifies every
  relation.
- The migration owner (`postgres`) must own both the function and backing
  table. Deployment verification must fail if either owner differs, if
  `prosecdef` is false, or if the function-local empty `search_path` is absent.
- PostgreSQL's default `PUBLIC` function execution is explicitly revoked.
- Only `bawean_app` receives `EXECUTE` on the exact function signature.
- The private schema is not exposed through Supabase Data API, and Supabase
  `anon`/`authenticated` roles retain no schema usage.

The D2 function initially accepts only the two public scopes. The local P7
migration candidate extends the existing constraint and function with the
compiled `admin-login` scope while preserving the same ownership, direct-table
denials, and exact function grant. Callers cannot supply their own limit or
window duration to weaken enforcement.

The P7 migration uses `CREATE OR REPLACE FUNCTION`, so it must be run by the
existing function owner (`postgres`). Post-migration verification must confirm
that the owner is still `postgres`, `prosecdef` remains true, the function-local
`search_path` is empty, and only `bawean_app` plus the owner can execute it.

## Client-address trust boundary

On Vercel, use its platform-provided client address, preferably the official
`ipAddress(request)` helper or `x-vercel-forwarded-for`. Vercel documents that
its platform value is the public client address and that it overwrites ordinary
`x-forwarded-for` to prevent spoofing. When a verified proxy is introduced,
its documented provider-specific header and Vercel proxy configuration must be
reviewed before changing this trust boundary.

Outside Vercel production, arbitrary forwarded headers must not be trusted.
Tests should inject a validated address through an internal dependency rather
than teaching production code to accept arbitrary headers. IPv4 and IPv6 are
validated before HMAC derivation. Only the digest and positive key version
cross the database boundary.

IP-based limiting has known residual risks: shared NAT can cause false
positives, IPv6 privacy-address rotation and distributed clients can evade a
single-address bucket, and rate limiting is not complete bot protection.

## Retention and cleanup

Every request deletes at most 32 expired rows, ordered by the expiry index,
using `SKIP LOCKED`. This is opportunistic cleanup: it limits the work added to
one request but does **not** guarantee a strict bound on live rows, expired-row
backlog, table size, or dead tuples. A burst of distinct identifiers can create
rows faster than a single call cleans them; if traffic then stops, expired rows
remain until later traffic or maintenance. PostgreSQL autovacuum reclaims dead
tuples on its own schedule, so deleting rows also does not immediately shrink
the table on disk.

Use these as initial operational alert thresholds and tune them after a real
traffic baseline exists:

- more than 10,000 expired rows continuously for 15 minutes;
- total table-plus-index size above 256 MiB;
- estimated dead tuples above both 10,000 rows and 20% of live rows; or
- `consume_rate_limit` p95 latency above 100 ms, or database-function errors
  above 1%, continuously for 5 minutes.

An optional scheduled cleanup may be added later as a separately reviewed,
owner-only operation. It should delete expired rows in bounded batches and run
as the migration owner (or through a dedicated owner-managed maintenance
function). It must not grant `SELECT`, `UPDATE`, or `DELETE` on the table—or
maintenance-function execution—to `bawean_app`, `PUBLIC`, `anon`,
`authenticated`, or `service_role`. No scheduler or cleanup function is added
by this migration.

## Deployment and rollback

After separate approval:

1. Reconfirm project `hqupjaaagwpafeuwyixe`, database `postgres`, verified
   owner TLS, clean migration history, and the reviewed migration checksum.
2. Validate the SQL in an isolated PostgreSQL 17 instance, including concurrent
   calls and privilege-denial tests.
3. Apply only with `npx prisma migrate deploy` through `DIRECT_URL`.
4. Verify that `app_private.rate_limit_bucket` is owned by `postgres`, has RLS
   enabled with no policies, and grants no direct privilege to `bawean_app`,
   `PUBLIC`, `anon`, `authenticated`, or `service_role`.
5. Verify that `app_private.consume_rate_limit(text, bytea, smallint)` is owned
   by `postgres`, has `SECURITY DEFINER` enabled, records an empty function-local
   `search_path`, and grants `EXECUTE` only to `bawean_app` plus its owner.
6. Verify that `public._prisma_migrations` has RLS enabled, none of the revoked
   roles has a table privilege, and the `postgres` owner can still run Prisma
   migration operations.
7. Run rollback-safe concurrent-limit, no-rewrite-after-denial, cleanup, input
   validation, and direct-table-denial tests through the runtime role.
8. Continue D2 backend work only after those checks pass.

The explicit transaction makes a SQL failure atomic. Do not retry, edit Prisma
migration history, reset, or drop objects automatically after a failure.

Rollback requires first deploying application code that does not call the
function, then a separately reviewed migration that revokes execution, drops
the function, and drops the table. Dropping the table resets abuse-control
history and temporarily restores every client to a fresh allowance, so rollback
should be treated as a security-impacting event. A rollback must not restore the
unsafe `public._prisma_migrations` grants or disable its RLS; that hardening is
independent and intentionally retained. The initial D1 application objects are
not modified by either deployment or rollback.
