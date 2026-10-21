# Supabase privilege audit

## Scope and execution status

D1 Task 1.3D audited the dedicated Supabase project
`hqupjaaagwpafeuwyixe` using certificate-verified TLS and an explicit
PostgreSQL `READ ONLY` transaction. The target database was `postgres`, the
server was PostgreSQL 17.11, and `app_private` did not yet exist. This is a
historical snapshot; D1.3F-R4 later deployed the reviewed initial migration
under a separate approval.

No role, grant, schema, table, extension, migration, setting, or application
data was created or changed. Query output was limited to catalog metadata,
privilege flags, and counts; no connection string, password, function body,
queued request content, Vault value, or private key was returned.

## Inventory

| Area | Observed state | Assessment |
| --- | --- | --- |
| `public` schema | `PUBLIC` has `USAGE`, not `CREATE`; zero relations and zero routines | Low |
| Database | `PUBLIC` has `CONNECT` and `TEMPORARY` | Medium resource-abuse surface |
| `pg_net` | Not installed; no `net` schema objects | No current HTTP/network path |
| `pg_cron` | No `cron.job` relation | No current scheduled network path |
| Webhook triggers | Zero matching or enabled HTTP/webhook triggers | No current trigger network path |
| `SECURITY DEFINER` | Zero routines both executable by `PUBLIC` and reachable through a `PUBLIC`-usable non-system schema | No discovered escalation path |
| Extension routines | Some routines default to `PUBLIC EXECUTE`, but their schemas (`extensions`, `auth`, `graphql_public`, `realtime`, and `storage`) do not grant `PUBLIC USAGE` | Not reachable by a new bare LOGIN role |
| Extension relations | `PUBLIC SELECT` appears on two `pg_stat_statements` views, but `extensions` lacks `PUBLIC USAGE` | Not reachable by a new bare LOGIN role |
| Vault | `supabase_vault` 0.3.1 is installed in `vault`; `vault` has no `PUBLIC USAGE` | Not reachable by a new bare LOGIN role |
| Privileged memberships | Existing Supabase service-role paths exist; `bawean_app` does not yet exist | Provisioning must retain zero memberships |
| Server-file functions | `PUBLIC EXECUTE` is revoked from inspected file read/import/export, backup, reload, and log routines | No discovered file/configuration escalation path |
| Backend signaling | `pg_cancel_backend` and `pg_terminate_backend` are executable, but PostgreSQL's internal role checks remain in force and `bawean_app` will not receive `pg_signal_backend` | Low; self-session disruption only |
| Large objects | `lo_create`, `lo_creat`, and `lo_open` are executable by `PUBLIC` | Medium storage/resource-abuse surface |

Installed extensions were `pg_stat_statements`, `pgcrypto`, `plpgsql`,
`supabase_vault`, and `uuid-ossp`. None supplied a reachable public network or
privilege-escalation routine under the observed schema grants.

## Risk classification

### Critical

None identified.

### High

None identified.

### Medium

1. Every LOGIN role inherits database `TEMPORARY`, allowing temporary-object
   resource consumption. PostgreSQL has no per-role deny that overrides a
   `PUBLIC` grant.
2. Every LOGIN role can create and open large objects through built-in
   `pg_catalog` routines granted to `PUBLIC`, creating another storage-abuse
   path if the runtime credential is compromised.

These capabilities do not grant access to `app_private`, role administration,
server files, Supabase-managed schemas, or another role's objects. They are
acceptable for a trusted server-only runtime credential when combined with
strict secret handling, a one-connection application pool, query/connection
monitoring, and prompt credential rotation after suspected compromise.

### Low

- System catalog metadata remains visible.
- `public` remains usable but is empty and does not allow `PUBLIC CREATE`.
- A runtime session can cancel or terminate its own sessions; internal
  PostgreSQL permission checks block signaling privileged sessions without
  membership in `pg_signal_backend`.

## Required mitigations and invariants

- Keep `pg_net` disabled unless a separately reviewed feature requires it.
  Re-run this audit after enabling Database Webhooks, installing extensions, or
  completing a major PostgreSQL upgrade.
- Never place secrets in pg_net request headers if pg_net is enabled later;
  Supabase's platform grants can make queued request data visible to LOGIN
  roles.
- Keep `public` empty for application objects and never add `bawean_app` to the
  Data API or an exposed schema.
- Provision `bawean_app` with zero memberships, no ownership, `NOINHERIT`, and
  `NOBYPASSRLS`; verify general and predefined privileged-role membership paths.
- Continue schema-qualifying application SQL. The configured `search_path` is
  only a safe default, not a security boundary.
- Do not revoke database `CONNECT` or `TEMPORARY` from `PUBLIC`, or alter
  Supabase-managed schemas, without a separate platform-impact review.

## Gate D result

**PASS.** The privilege inventory is complete for the proposed new LOGIN role,
no unresolved critical escalation path exists, and the remaining medium risks
are bounded platform/resource risks acceptable for the trusted server-only
runtime role. Task 1.3E was subsequently approved and completed with the role
attributes and zero-membership/zero-ownership invariants verified. Application
schema creation, object grants, and migration execution later passed separate
Task 1.3F approvals and were verified in the R4/R5 gates.
