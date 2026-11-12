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

The photo row uses `ON DELETE RESTRICT`. This intentionally prevents database
retention from deleting a menfess while its Storage object may still exist.
The existing owner-only retention function currently does not skip or clean
photo rows. Before executing retention against photo-bearing menfess, an
approved update to that function or owner procedure must remove the private
object and photo row first. Until then, a retention batch containing such a
menfess will roll back rather than orphan an object. This is an operational
release blocker for long-term retention and needs owner review.

No production schema, bucket, secrets, cron job, or data were changed while
preparing this implementation.
