# Bawean Menfess runtime database role

## Scope and execution status

D1 Task 1.3E provisioned the approved PostgreSQL LOGIN role `bawean_app` on
project `hqupjaaagwpafeuwyixe`, database `postgres`. D1 Task 1.3F subsequently
deployed the approved initial migration after isolated PostgreSQL 17
verification. The current `app_private` grants are those in the migration and
were confirmed by the read-only R5 privilege audit.

The role is intentionally separate from the migration owner:

- `DATABASE_URL` uses `bawean_app` through the shared Supavisor transaction
  pooler on port 6543.
- `DIRECT_URL` remains the certificate-verified `postgres` owner connection
  used only by controlled Prisma migration operations.
- Neither URL may be exposed to client components or use a `NEXT_PUBLIC_`
  variable.

For the shared pooler, the runtime username is
`bawean_app.hqupjaaagwpafeuwyixe`. The exact pooler host must still be copied
from the Supabase Dashboard rather than derived from the region.

### Task 1.3E execution evidence

- The owner preflight and runtime login both used certificate-authenticated
  TLS (`encrypted = true`, `authorized = true`, no authorization error).
- PostgreSQL reported version 17.11 and database `postgres`; the endpoint and
  pooler username matched project `hqupjaaagwpafeuwyixe`.
- The role has `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOREPLICATION`, `NOBYPASSRLS`, and `NOINHERIT`, with the approved
  `search_path`.
- The role has zero memberships, owns zero objects, and has zero direct table
  grants before migration.
- A 32-byte random password was generated locally and installed as a
  client-derived SCRAM-SHA-256 verifier. The cleartext value was written only
  to ignored `.env.local`; it was not placed in SQL, logs, or shell history.
- `DATABASE_URL` now authenticates through the transaction pooler as
  `bawean_app`; `DIRECT_URL` remains the migration-owner connection.

The official `node-postgres` client was used because `psql` was unavailable on
the workstation. It executed the exact reviewed transaction from the
provisioning script. Password installation used an equivalent secure
client-side SCRAM operation instead of the script's interactive `\password`
meta-command.

## Provisioning procedure

[`scripts/database/provision-runtime-role.sql`](../scripts/database/provision-runtime-role.sql)
is a fail-closed psql script. It:

1. stops if `bawean_app` already exists so an unknown role is never adopted;
2. creates a LOGIN with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
   `NOREPLICATION`, `NOBYPASSRLS`, and `NOINHERIT`;
3. creates it with `PASSWORD NULL`, no role memberships, and no object
   ownership or grants; and
4. invokes psql's interactive `\password` command only after the role
   transaction commits.

The script performs no lookup, grant, ownership change, or DDL against
`app_private`, so it is safe to execute before that schema exists. Its role
`search_path` setting may name a not-yet-created schema; PostgreSQL stores that
setting without requiring the schema to exist. Run the script only after
explicit approval, through a certificate-verified owner connection. An
existing role is a hard stop: run the read-only verification first and
investigate its grants, memberships, and owned objects.

Generate a unique password with a trusted password manager using at least 32
random bytes (43 base64url characters or equivalent). Paste it only into the
hidden `\password` prompts. Never place it in SQL, shell arguments, source
control, tickets, screenshots, or chat. Store it only in ignored `.env.local`
and the deployment platform's encrypted secret store.

For rotation, use the owner connection and `\password bawean_app`, update the
deployment secret, redeploy, and drain old application connections. PostgreSQL
password changes apply to new connections; existing pooled sessions can remain
usable until closed. A coordinated rotation may therefore cause a short
reconnection window. Never reuse the owner password for this role.

## Exact `app_private` privilege matrix

The initial migration revokes all direct `app_private` privileges from the
runtime role before granting this matrix:

| Object | Runtime privileges |
| --- | --- |
| Schema | `USAGE`; never `CREATE` or ownership |
| `MenfessStatus`, `ModerationAction` | `USAGE` |
| `category` | `SELECT` |
| `menfess` | `SELECT`; column-level `INSERT` for submission data; column-level `UPDATE` only for status/version/publication metadata |
| `moderation_log` | `SELECT`; column-level `INSERT` for audit entries; never `UPDATE`, `DELETE`, `TRUNCATE`, or `TRIGGER` |
| `auth_user` | `SELECT`; column-level `UPDATE` for name, email, verification, image, and timestamp; never runtime `INSERT`, `DELETE`, or `role` update |
| `auth_session` | `SELECT`, `INSERT`, `DELETE`; column-level `UPDATE` for mutable session fields |
| `auth_account` | `SELECT`, `INSERT`, `DELETE`; column-level `UPDATE` for tokens, password, scope, expiries, and timestamp |
| `auth_verification` | `SELECT`, `INSERT`, `DELETE` |
| Sequences | none; UUID defaults use `pg_catalog.gen_random_uuid()` |
| Trigger functions | no direct `EXECUTE` grant |

The migration owner creates the triggers while it has `TRIGGER` and function
`EXECUTE` privileges. PostgreSQL checks those privileges when the trigger is
created. The runtime role only performs table DML; it cannot create, replace,
disable, or bypass the triggers. Because the functions are `SECURITY INVOKER`,
their reads use `bawean_app` privileges: the required `SELECT` grants on
`auth_user`, `menfess`, and `moderation_log` are included.

The moderation transaction can update only the approved `menfess` state
columns and insert an audit row. The database guards still enforce the allowed
transition, one-step version increment, administrator actor, matching target
state, and deferred existence of an audit record. With no audit mutation or
trigger privilege and no object ownership, `bawean_app` cannot disable the
append-only controls.

## Better Auth compatibility boundary

The restricted grants support sign-in for an already provisioned
administrator, session creation/refresh/revocation, credential-account token
and password maintenance, and verification-token lifecycle operations. Core
Better Auth model reads are allowed.

Public signup is required to be disabled. `auth_user` creation, deletion, and
role assignment deliberately fail through `DATABASE_URL`; administrators must
be provisioned later through the separately approved, audited owner workflow.
The Better Auth Admin plugin and account-management routes are not approved and
would require a new privilege review. In particular, enabling a route that
creates/deletes users or changes `role` is incompatible with this matrix by
design.

## Supabase `PUBLIC`-grant constraint

`NOINHERIT` blocks automatic inheritance from memberships, but it does not
remove privileges granted to PostgreSQL `PUBLIC`. Current Supabase projects
give every LOGIN role some platform-level privileges, including database
`CONNECT`/`TEMPORARY`, catalog visibility, and—when `pg_net` is installed—access
to objects in the `net` schema. The project owner cannot selectively revoke a
`PUBLIC` grant from only `bawean_app`.

This does not broaden `app_private`, whose `PUBLIC` privileges are explicitly
revoked, but it is a platform constraint that must be audited before live role
creation. If `pg_net` is enabled, choose explicitly between:

- removing the extension after verifying no Database Webhooks or other project
  dependency uses it; or
- accepting and documenting that the trusted server runtime role can use
  `pg_net` and may read queued request data.

No such choice or live change is made in Task 1.3C. The verification script
lists effective privileges outside `app_private` so this constraint cannot be
missed.

Task 1.3D subsequently completed the live read-only inventory. `pg_net` was not
installed, `public` was empty, and no reachable `PUBLIC`-executable
`SECURITY DEFINER` routine was found. The remaining `PUBLIC` surfaces and their
mitigations are recorded in
[`SUPABASE_PRIVILEGE_AUDIT.md`](SUPABASE_PRIVILEGE_AUDIT.md).

## Verification and deployment gate

[`scripts/database/verify-runtime-role.sql`](../scripts/database/verify-runtime-role.sql)
contains read-only checks for attributes, memberships, ownership, exact
application grants, protected audit privileges, protected `auth_user.role`,
and effective access outside `app_private`.

Expected results after provisioning and migration are:

- exactly one role row, with only `rolcanlogin = true` among the capability
  flags and `rolinherit = false`;
- zero membership and ownership rows;
- schema `USAGE = true`, `CREATE = false`;
- all protected audit/user privilege booleans `false`; and
- only the reviewed table/column privileges in `app_private`.

Before changing `.env.local`, verify a certificate-authenticated pooled
connection reports `current_user = 'bawean_app'`, the intended database and
project endpoint, and successful read/write behavior in a disposable test
transaction. Keep `DIRECT_URL` owner-only. Do not run those live checks until
role creation and migration execution receive separate approval.
