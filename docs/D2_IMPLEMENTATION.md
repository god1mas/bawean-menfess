# D2 anonymous submission and tracking

## Scope and production state

D2 implements the local public submission and tracking journey using the
existing Supabase PostgreSQL architecture. The explicit D2 master decision is
Supabase-only and supersedes older planning references to Upstash or Redis.
No Redis client or infrastructure is used. Read-only production verification
confirmed D1 and D2 are applied, the five approved categories are seeded, and
the expected six Vercel Production variable names are configured. No confirmed
production application deployment is recorded.

## Public routes

| Method | Route | Request | Public response |
| --- | --- | --- | --- |
| `GET` | `/api/public/categories` | None | Active category `slug` and `label` only |
| `POST` | `/api/public/menfess` | `{ category, message, consent: true, idempotencyKey }` | One-time `trackingCode` and fragment-based `trackingPath` |
| `POST` | `/api/public/track` | `{ token }` | `{ status }` only |

All endpoints use no-store and no-referrer response headers. Request bodies are
limited and validated with strict Zod objects. Administrative fields are
rejected. Errors are generic and never include submitted text, Prisma details,
database identifiers, token digests, moderation notes, or stack traces.

## Tracking credentials

The browser creates a fresh 256-bit random idempotency key for each intentional
submission and retains it in memory only while that request is retried. The
server derives two independent tracking credentials with domain-separated
HMACs and independent tracking secrets:

- human-readable code: 20 Crockford Base32 characters grouped as
  `BM-XXXX-XXXX-XXXX-XXXX-XXXX` (100 effective random bits);
- secure URL token: `bmu_` plus 32 random bytes encoded as unpadded base64url
  (256 random bits).

The URL token is carried in `/lacak#t=...`, so it is not sent in HTTP request
targets or referrers. The tracking page removes the fragment before sending the
token in a POST body. Neither credential is stored in browser storage.

Only separate HMAC-SHA-256 digests and positive key versions are stored. The
server requires independent keys for code, URL token, rate-limit identity, and
Better Auth. The current lookup supports key version 1. Rotation requires a
reviewed release that retains old keys while their credentials remain valid;
losing a key makes matching credentials unrecoverable. Raw credentials and the
idempotency key cannot be recovered from the database and are shown only in the
successful response. A retry with the same key and content returns the same
credentials; reusing the key for different content is rejected. Identical
content sent with a new key remains a distinct, intentional submission. The
replay lifetime follows menfess retention and remains an owner decision in
`POLICY_DECISIONS.md`.

## Submission and tracking behavior

The database is the category source of truth. Submission uses one parameterized
`INSERT ... SELECT` that verifies an active category and writes the menfess with
the database default `PENDING` status. No visitor account or sender identity is
created. Unique HMAC digest constraints serialize concurrent retries. A unique
conflict is a replay only when both derived digests and the original
category/message match.

Tracking accepts either credential, uses its matching versioned digest, and
returns only `PENDING`, `APPROVED`, `PUBLISHED`, or `REJECTED`. Malformed and
unknown credentials receive the same response. Rejected status copy is generic
and does not expose internal reasons. “Diterima” and “Dalam moderasi” remain UI
labels for `PENDING`, not database states.

## Rate limiting and client identity

Submission allows 5 requests per 60-minute fixed window. Tracking allows 30
requests per 10-minute fixed window. Administrator email/password sign-in
allows 5 attempts per 15-minute fixed window through the canonical Better Auth
HTTP route. The PostgreSQL function performs an atomic upsert and saturates at
`limit + 1`; repeated denied calls do not rewrite the row. Fixed windows permit
a boundary burst of up to twice the normal allowance, which is accepted for
the MVP.

Production trusts only Vercel's overwritten `x-vercel-forwarded-for` value,
validates and normalizes the address, domain-separates it by endpoint scope,
and stores only an HMAC digest. If trusted identity or the database function is
unavailable, protected endpoints fail closed with `503`.

Administrator sign-in uses Better Auth custom rate-limit storage backed by the
same private function. Its bucket key is separately domain-separated and
HMAC-derived; raw IP addresses, email addresses, and passwords are never stored
in the limiter. Deploying this support requires the separately reviewed
`20261027130000_add_admin_login_rate_limiting` migration before the updated
application code.

Cleanup removes at most 32 expired rows opportunistically per invocation. It
does not guarantee bounded storage; monitoring and an optional owner-only
scheduled cleanup are described in `D2_RATE_LIMITING.md`.

## Figma reconciliation

The responsive pages follow the referenced desktop and mobile frames, reuse the
official logo, and use exported decorative assets rather than screenshots. The
Figma frames show older category names and an optional pseudonym. The approved
functional requirements take precedence: the UI consumes Confess, Curhat,
Ask BM, Connect, and Discuss from the database, and no pseudonym is collected.

## Moderation and administrator bootstrap

The authenticated administrator dashboard lists, filters, searches, paginates,
and displays submission details and audit history. Server-side authorization
re-reads the administrator role for each request. Mutations require a trusted
Origin, validate strict request schemas, and use a database transaction with
optimistic version checks. The approved D1 status lifecycle is
`PENDING → APPROVED/REJECTED` and `APPROVED → PUBLISHED`; unpublish is not
supported by the schema. Rejection requires an audit reason. Tracking lookups
continue to expose status only.

The interactive `npm run admin:bootstrap-first` command is a trusted operator
workflow, not a web route. It uses Better Auth's password hasher, serializes
concurrent attempts, and refuses if any administrator already exists. It has
not been run against production as part of this implementation; production
administrator provisioning requires explicit operational approval. Details
are in [`ADMINISTRATOR_SETUP.md`](ADMINISTRATOR_SETUP.md) and
[`MODERATION_WORKFLOW.md`](MODERATION_WORKFLOW.md).

## Required server environment

- `DATABASE_URL`
- `DIRECT_URL` (migration tooling only)
- `TRACKING_CODE_HMAC_KEY_V1`
- `TRACKING_URL_HMAC_KEY_V1`
- `RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

All real values belong in ignored local files or the deployment secret store.
No D2 secret uses a `NEXT_PUBLIC_` prefix. Production variable names were
verified without retrieving their values; no value is documented here.
