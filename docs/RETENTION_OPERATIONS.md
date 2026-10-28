# Retention operations runbook

## Architecture and boundary

Migration `20261028130000_add_policy_retention` prepares, but does not schedule
or run, `app_private.run_retention_cleanup(integer)`. It is owned by `postgres`,
uses an empty `search_path`, and has no `EXECUTE` grant for `PUBLIC`, Supabase
API roles, or `bawean_app`. Normal administrators cannot set legal holds or
invoke cleanup. The owner must use `set_menfess_legal_hold(uuid,text)` and
`release_menfess_legal_hold(uuid)`; both share a transaction advisory lock with
cleanup so those operations cannot race.

The function locks eligible rows with `FOR UPDATE SKIP LOCKED`, rechecks legal
holds at deletion, removes publication-removal records and moderation logs
before their menfess, removes bounded expired rate-limit rows, and writes only
counts/timestamps to an append-only cleanup-run table. It is retry-safe and
transactional. The append-only audit trigger permits deletion only while the
owner-only function runs; ordinary owner/runtime mutations remain rejected.

## Required production sequence (not authorized yet)

1. Apply the reviewed migration through the certificate-verified `postgres`
   migration connection.
2. Verify ownership, empty function `search_path`, revocations, triggers,
   constraints, and that `bawean_app` cannot execute cleanup or update holds.
3. Use an owner-controlled scheduler to call `SELECT * FROM
   app_private.run_retention_cleanup(500)` daily. Never store the owner password
   in application runtime variables.
4. Alert when a run fails, when no successful run occurs for 48 hours, or when
   expired rate-limit rows remain for seven days.
5. Review count-only cleanup evidence; never log message text or credentials.

Legal holds must be set and removed only through the owner functions with a
documented legal reason. Direct column updates are not an approved operating
procedure. Legal review is required before first use.

## Restore and deletion reapplication

Before restoring, export a protected deletion ledger containing only stable
record identifiers, deletion timestamps, and legal-hold decisions. After a
restore, reset custom-role passwords as required by Supabase, validate the
schema/migrations, replay every deletion that occurred after the chosen restore
point, then verify that tracking lookups remain unavailable. Keep the site
protected until reconciliation completes. Actual backup inventory, PITR state,
and restore behavior remain unverified; no restore has been performed.

