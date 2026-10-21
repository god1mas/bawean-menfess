# D2 anonymous submission and tracking

## Scope and production boundary

D2 implements the local public submission and tracking journey using the
existing Supabase PostgreSQL architecture. The explicit D2 master decision is
Supabase-only and supersedes older planning references to Upstash or Redis.
No Redis client or infrastructure is used.

The migration
`20261022130000_add_postgres_rate_limiting` remains unapplied to production.
Production also has no approved category seed. Until both receive separate
approval, the category endpoint can legitimately return an empty list and the
submission UI displays an unavailable state instead of inventing options.

## Public routes

| Method | Route | Request | Public response |
| --- | --- | --- | --- |
| `GET` | `/api/public/categories` | None | Active category `slug` and `label` only |
| `POST` | `/api/public/menfess` | `{ category, message, consent: true }` | One-time `trackingCode` and fragment-based `trackingPath` |
| `POST` | `/api/public/track` | `{ token }` | `{ status }` only |

All endpoints use no-store and no-referrer response headers. Request bodies are
limited and validated with strict Zod objects. Administrative fields are
rejected. Errors are generic and never include submitted text, Prisma details,
database identifiers, token digests, moderation notes, or stack traces.

## Tracking credentials

Each successful insert creates two independent credentials with Node.js
cryptographic randomness:

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
losing a key makes matching credentials unrecoverable. Raw credentials cannot
be recovered from the database and are shown only in the successful response.

## Submission and tracking behavior

The database is the category source of truth. Submission uses one parameterized
`INSERT ... SELECT` that verifies an active category and writes the menfess with
the database default `PENDING` status. No visitor account or sender identity is
created. Duplicate credential digests are retried with new entropy.

Tracking accepts either credential, uses its matching versioned digest, and
returns only `PENDING`, `APPROVED`, `PUBLISHED`, or `REJECTED`. Malformed and
unknown credentials receive the same response. Rejected status copy is generic
and does not expose internal reasons. “Diterima” and “Dalam moderasi” remain UI
labels for `PENDING`, not database states.

## Rate limiting and client identity

Submission allows 5 requests per 60-minute fixed window. Tracking allows 30
requests per 10-minute fixed window. The PostgreSQL function performs an atomic
upsert and saturates at `limit + 1`; repeated denied calls do not rewrite the
row. Fixed windows permit a boundary burst of up to twice the normal allowance,
which is accepted for the MVP.

Production trusts only Vercel's overwritten `x-vercel-forwarded-for` value,
validates and normalizes the address, domain-separates it by endpoint scope,
and stores only an HMAC digest. If trusted identity or the database function is
unavailable, protected endpoints fail closed with `503`.

Cleanup removes at most 32 expired rows opportunistically per invocation. It
does not guarantee bounded storage; monitoring and an optional owner-only
scheduled cleanup are described in `D2_RATE_LIMITING.md`.

## Figma reconciliation

The responsive pages follow the referenced desktop and mobile frames, reuse the
official logo, and use exported decorative assets rather than screenshots. The
Figma frames show older category names and an optional pseudonym. The approved
functional requirements take precedence: the UI consumes Confess, Curhat,
Ask BM, Connect, and Discuss from the database, and no pseudonym is collected.

## Required server environment

- `DATABASE_URL`
- `DIRECT_URL` (migration tooling only)
- `TRACKING_CODE_HMAC_KEY_V1`
- `TRACKING_URL_HMAC_KEY_V1`
- `RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

All real values belong in ignored local files or the deployment secret store.
No D2 secret uses a `NEXT_PUBLIC_` prefix.
