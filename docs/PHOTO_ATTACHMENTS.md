# Optional menfess photo: local implementation and release gate

This feature accepts zero or one JPEG, PNG, or WebP photo of at most 1 MiB.
The public route retains the existing JSON path for text-only submissions. A
photo submission uses bounded multipart parsing, the existing submission rate
limit, server-side signature/decoder validation, a 16-megapixel pixel cap, and
re-encoding with `sharp`. Re-encoding applies orientation and strips EXIF and
other embedded metadata; it can increase file size, in which case the request
is rejected. The sender's filename never becomes a Storage path.

## Data and security

- `app_private.menfess_photo` records a random object path, content type, byte
  count, SHA-256 of the processed image, lifecycle state, and optional menfess
  relation. It stores no image bytes, sender filename, or tracking credential.
- A `STAGED` row is created before upload. The private bucket object is uploaded
  with upsert disabled. The menfess insert and `STAGED` to `ATTACHED` transition
  share one PostgreSQL transaction. An interrupted upload leaves a durable row
  for reconciliation. Duplicate requests cannot create another menfess because
  existing tracking digest uniqueness remains authoritative.
- REJECTED and PUBLISHED transitions mark the photo `DELETE_PENDING` in the
  existing moderation transaction. The Storage delete follows after the HTTP
  response using Next.js `after`; failures remain retryable. `ATTACHED` photos
  are never selected by orphan cleanup. `CLEANING` is a claim state for
  concurrent cleanup attempts. A successful Storage delete removes the row.
- Owner-only retention first queues eligible photo rows as `RETENTION_PENDING`.
  The worker rechecks eligibility and legal hold under a short parent-row lock,
  then claims `CLEANING` before contacting Storage. The owner-only retention
  function skips every menfess with a live photo reference; text-only
  candidates continue even when one photo deletion fails. After confirmed
  Storage removal, a `RETENTION_CLEANED` tombstone blocks moderation until
  owner retention removes it and the menfess in one transaction. The original
  90/365-day eligibility rules remain unchanged.
- The admin image route checks the Better Auth administrator session and role
  on every request, permits only `ATTACHED` photos on PENDING/APPROVED menfess,
  returns private no-store binary responses, and never returns a Storage URL.
  Storage's privileged key is available only to server code.
- `vercel.json` schedules a daily reconciliation of at most 25 pending/staged
  rows. `/api/internal/photo-cleanup` requires an independent 32-byte-or-longer
  `CRON_SECRET`; unauthorized callers receive 401. Monitor pending rows and
  failures. A daily bounded batch does not guarantee a strict storage bound
  under sustained failures or a larger backlog.

## Production setup — requires separate approval

1. Review and apply only `20261112130000_add_menfess_photo` with Prisma Migrate
   Deploy after verifying the checksum and existing migration history. Do not
   apply the migration through the Data API. The migration touches only
   `app_private`, not Supabase's managed `storage` schema.
2. In the matching Supabase project, create a bucket named `menfess-photos`:
   **Private**, file size limit **1,048,576 bytes**, allowed MIME types
   `image/jpeg`, `image/png`, `image/webp`. Keep anonymous and authenticated
   Storage policies absent. Verify its identity and settings through the
   Storage API or Dashboard before enabling uploads. Never manipulate
   `storage.objects` directly; file deletion must use the Storage API.
3. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` as
   Production-only server-side secrets. The Storage key must belong to the
   same Supabase project as `DATABASE_URL`. Never put these values in Git,
   client components, or `NEXT_PUBLIC_` variables. Rotate the Storage key if
   exposed. Set the cron secret independently of auth and tracking keys.
4. Verify Vercel Cron can reach the protected production route with
   `CRON_SECRET` in this project's deployment protection configuration.
   Do not disable Vercel Authentication or add a protection bypass without
   separate authorization. If the cron cannot reach the route, use a separately
   authorized owner-run scheduled invocation; immediate post-moderation
   deletion still runs, but orphan and failed-delete retries are incomplete.
5. Test with controlled text-only and photo submissions on an isolated
   environment, including a forced Storage delete failure and retry. Review
   the privacy notice with the owner before public rollout.

## Retention interaction and recovery

The `ON DELETE RESTRICT` foreign key is the final barrier against deleting a
menfess before its Storage object is removed. The unapplied photo migration
updates the existing owner-only retention function in place: it skips photo
rows without deleting their audit history, so a failed photo cleanup does not
roll back deletion of unrelated eligible text-only menfess. Only the
`postgres` owner can invoke `app_private.queue_retention_photos(500)` and
`app_private.run_retention_cleanup(500)`; neither function is exposed to the
application runtime role, Data API roles, or public users.

The proposed owner-controlled operating order (requires separate approval) is:

1. Queue eligible photo rows with `SELECT app_private.queue_retention_photos(500)`
   using the owner connection. This is a short SQL transaction and makes no
   network call. Re-running the queue is idempotent.
2. Let the authenticated, `CRON_SECRET`-protected reconciler delete queued
   objects through the Supabase Storage API. It claims one row at a time and
   marks a `RETENTION_CLEANED` tombstone only after Storage confirms removal.
   Never
   delete from `storage.objects` with SQL. A failed Storage call restores the
   retryable state; a database failure after Storage success leaves `CLEANING`
   for a delayed retry. If a missing-object response prevents retry, an owner
   must verify object absence through the Storage API before repairing the
   reference; do not manually delete it merely on an HTTP error.
3. Run `SELECT * FROM app_private.run_retention_cleanup(500)` with the owner
   connection. It deletes only eligible menfess with no live photo row and
   removes cleaned tombstones in the same transaction. Repeat
   bounded passes as monitored backlog requires. Never store `DIRECT_URL` or
   the owner password in Vercel application runtime variables.

A legal hold set before the Storage claim cancels a queued retention deletion
and restores `ATTACHED`. During `CLEANING`, setting a hold returns a retryable
conflict. Once `RETENTION_CLEANED`, a hold can preserve the remaining menfess
and audit data, but cannot restore the already-deleted photo. Moderation also returns
a retryable conflict while retention owns the photo, including the cleaned
tombstone; after cleanup, the owner retention process may remove the menfess.
Normal moderation without a retention claim is unchanged. Monitor
`RETENTION_PENDING`, `RETENTION_CLEANED`, `DELETE_PENDING`, stale `CLEANING`,
and failed reconciler runs. A bounded daily batch does not promise
a strict deletion deadline or bounded storage growth.

## Migration safety and Phase 4 deployment checklist

- The revised migration creates only `app_private.menfess_photo`, its indexes,
  policies and triggers, plus owner-only functions. It replaces the existing
  retention and legal-hold function bodies with the same signatures; it does
  not edit previously applied migrations or Supabase-managed schemas. It uses
  an explicit transaction and contains no data deletion. PostgreSQL 17
  compatibility and runtime/owner privilege behavior were tested locally.
- Production read-only inspection found the historical initial-migration row
  with `finished_at = NULL` is explicitly marked rolled back, and a separate
  successful row for that migration exists. Do not resolve or edit history.
  The photo table/migration are not yet present in Production.
- Before deployment, verify the migration checksum against the reviewed file,
  database identity, current migration history, `bawean_app` role, and current
  production data counts. Obtain separate migration approval. Apply only via
  Prisma Migrate Deploy; stop on any drift or unexpected error.
- Verify function owners, `search_path`, EXECUTE revocations, RLS, column
  grants, legal-hold cancellation, moderation conflict, and text-only cleanup
  on a controlled environment. Do not run retention cleanup on Production as
  a migration smoke test.
- Obtain separate approval to create the private bucket and set server-only
  secrets. Verify Vercel Authentication does not prevent the scheduled cleanup
  request; do not add a bypass or disable protection implicitly. Confirm an
  owner-controlled schedule for queue and retention runs before relying on
  automated retention.
- Roll out the application only after migration, bucket, secrets, and scheduler
  checks pass. Use controlled upload/moderation tests, monitor cleanup lag,
  and keep rollback conditional: rolling back application code does not undo
  stored objects or the additive migration. Never drop the photo table while
  objects or references remain.

No production schema, bucket, secrets, cron job, or data were changed while
preparing this implementation.
