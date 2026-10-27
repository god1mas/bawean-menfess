# Administrator setup

## Status

- **IMPLEMENTED:** interactive, owner-connection bootstrap CLI.
- **LOCALLY VERIFIED:** validation, atomic creation, concurrency, duplicate
  refusal, Better Auth password compatibility, and login behavior on the
  disposable PostgreSQL 17 test database.
- **PRODUCTION VERIFIED:** schema, role model, TLS connectivity, and current
  administrator count (`0`) were checked read-only.
- **PENDING USER APPROVAL:** creation of the first production administrator.
- **BLOCKED:** web login verification until an administrator is created and a
  protected production deployment exists.

## Access model

Only provisioned Better Auth users with the database-owned `admin` role may
open the dashboard or call moderation APIs. The application re-reads the role
from PostgreSQL on each protected request. Public signup, visitor accounts,
social login, and web-based bootstrap are disabled.

The one-time bootstrap is an operator-only Node.js CLI:

```powershell
npm run admin:bootstrap-first
```

Before invocation, verify that `DIRECT_URL` points to the intended dedicated
Bawean Menfess PostgreSQL database and that Prisma's strict CA configuration is
intact. The CLI accepts only the approved local PostgreSQL target or the
dedicated Bawean Menfess Supabase target, requires an interactive terminal,
prints the target host/database/role for operator confirmation, and requires
the exact phrase `CREATE FIRST ADMIN`. It never prints the entered password.
Do not pass credentials through command-line arguments or shell history.

Production use is a separate operational action and requires explicit release
approval. P6.1 implementation and tests do not create a production account.
The CLI fails closed if any administrator already exists. A transaction-scoped
PostgreSQL advisory lock serializes simultaneous invocations, and both the
admin user and Better Auth credential account are inserted atomically. The
password is validated and hashed with Better Auth's installed password
hasher; raw credentials are not stored or logged.

For local bootstrap testing, use only the disposable PostgreSQL runner and its
bootstrap-only database. Never point test fixtures at `DIRECT_URL` or a
production database.

## Environment contract

Server-only settings are `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`DATABASE_URL`, and `DIRECT_URL`. The D2 tracking and rate-limit HMAC keys are
also required by the application. Keep actual values in ignored `.env.local`
or the deployment secret store. `BETTER_AUTH_URL` must match the application
origin; production requires HTTPS. Do not add a `NEXT_PUBLIC_` prefix to any
credential or database setting.

The committed Supabase root CA is public trust material. Prisma's migration
configuration and the runtime node-postgres adapter retain strict certificate
and hostname validation. The admin page and moderation/auth API server output
explicitly trace the CA file for deployment packaging.

## Production bootstrap runbook

### Prerequisites

1. Obtain explicit approval naming the Supabase project
   `hqupjaaagwpafeuwyixe`, database `postgres`, and the first-admin operation.
2. Use a trusted, patched operator workstation with an interactive terminal.
   Do not use a shared CI runner, Vercel Function, browser console, or shell
   transcript recorder.
3. Use the exact reviewed release checkout and lockfile. Verify the working
   tree and the bootstrap script diff before execution.
4. Confirm the committed CA certificate is present and verify the approved
   database connection with a read-only, certificate-authorized TLS query.
5. Confirm `DIRECT_URL` authenticates as the `postgres` migration owner against
   database `postgres` on project `hqupjaaagwpafeuwyixe`. Never substitute
   `DATABASE_URL` or place `DIRECT_URL` in Vercel runtime configuration.
6. Read-only verify that the administrator count is still zero. If it is not
   zero, stop: the CLI is not an account-management or password-reset tool.
7. Create the administrator password in a password manager. Although the CLI
   accepts 12–128 characters, use a unique randomly generated password of at
   least 20 characters and transfer it to the intended administrator through
   an approved secret-sharing channel.
8. Keep Vercel Authentication protection enabled for the production domain so
   public submissions cannot start while administrator readiness is being
   established.

### Execution

Run only after the dedicated bootstrap approval:

```powershell
npm run admin:bootstrap-first
```

The CLI displays only the target host, database, and role. Confirm those
non-secret attributes, enter exactly `CREATE FIRST ADMIN`, then enter the
administrator name, email, and hidden password twice. Do not paste the password
into a command argument, environment variable, ticket, chat, or log.

Expected successful output is `First administrator created. No password was
displayed.` The transaction creates one `auth_user` with database-controlled
role `admin` and one Better Auth `credential` account. It does not create a
session, deploy code, or change existing users.

### Verification

1. Run an aggregate read-only database check confirming exactly one admin and
   one credential account for that user. Do not select or display the password
   hash, email address, session token, or other credentials.
2. From the protected production origin, sign in through `/admin/login`.
3. Verify `/api/admin/session` returns only the minimized administrator
   identity and no-store headers.
4. Verify the dashboard can read totals, queue, detail, and audit history, then
   verify logout invalidates access.
5. Do not perform an approve/reject/publish mutation unless a separate test
   record and production-write approval have been provided.

### Failure recovery

- Validation, connection, identity, or confirmation failure occurs before a
  database commit; correct the cause and restart only after confirming the
  target.
- The database work is transactional. If the process terminates with an
  uncertain result, do not rerun immediately. First query only the admin and
  credential counts. A committed admin causes every later bootstrap attempt to
  fail closed with `ADMIN_ALREADY_EXISTS`.
- Concurrent invocations serialize on a transaction-scoped advisory lock, so
  only one can succeed. Treat any second attempt as an operational error.
- Never delete or overwrite a production user to make bootstrap pass. Any
  repair of a partially understood state requires a separately reviewed plan.
- If the created credentials are incorrect or compromised, keep the deployment
  protected. Self-service password rotation is not implemented. Prepare and
  approve a dedicated offline rotation/recovery operation that uses Better
  Auth's installed password hasher and an atomic owner transaction; do not edit
  the stored hash manually.

### Ongoing credential handling

The administrator must store the password in an approved password manager,
avoid credential reuse, and rotate after suspected disclosure or operator
handoff. Each rotation is a separate privileged operation until an audited
password-change workflow is implemented. Rotate `BETTER_AUTH_SECRET` only under
a separate session-invalidation plan because existing sessions may become
invalid.
