# Production release runbook

## Release state vocabulary

- **IMPLEMENTED:** present in the local release tree.
- **LOCALLY VERIFIED:** exercised by the current local quality gates.
- **PRODUCTION VERIFIED:** checked read-only against current production
  metadata or database state.
- **PENDING USER APPROVAL:** prepared but not authorized for execution.
- **BLOCKED:** must be resolved before the production domain is made public.

## Current release boundary

The application is **IMPLEMENTED** and the local test suite is **LOCALLY
VERIFIED**. Supabase and Vercel metadata are **PRODUCTION VERIFIED** read-only.
There is no Vercel deployment and no production administrator.

The project currently uses Vercel Authentication protection for deployment
URLs but excludes custom/production domains (`all_except_custom_domains`), and
automatic production-domain assignment is enabled. Consequently, a successful
production deployment could expose `bawean-menfess.vercel.app` and its public
submission endpoint before administrator login and moderation have been
verified. This is a **BLOCKED** public-launch boundary.

The smallest operational remedy is **PENDING USER APPROVAL**: temporarily set
Vercel Authentication protection to all deployments, including the production
domain, before the first production deployment. Keep it enabled through admin
bootstrap and authenticated moderation verification. Removing that protection
is the separate public-launch action. An application-level
`PUBLIC_SUBMISSIONS_ENABLED` gate is a valid alternative, but it is not
implemented and requires a separate code/configuration review.

## Required approvals

Obtain distinct approval for each state-changing operation:

1. Exact Git release manifest and commit.
2. Push to a non-production review branch, if used.
3. Temporary all-deployments Vercel Authentication protection.
4. Production deployment or a push to `main` that can trigger it.
5. Production first-administrator bootstrap.
6. Promotion/domain assignment if a staged deployment is used.
7. Public launch by relaxing temporary production protection.
8. Any emergency alias, protection, environment, or database change.

## Pre-release checks

From the exact reviewed worktree:

```powershell
npm ci
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run test:postgres
npm run test:e2e
npm run build
npm audit
npm audit --omit=dev
git diff --check
```

Confirm the two migration hashes remain:

- D1: `71fec35ce36addb229654eb83e8779f33db51080ec562fe092a0dd615f60eb8b`
- D2: `0c8265fd93526719c8af092a7bb746478be129c63d2807eecc28351544ae3424`

Confirm `.env.local`, `.vercel`, `.next`, Playwright output, test output, and
generated Prisma client output remain ignored. Confirm the release includes
the official `public/bawean-menfess-logo.png` and excludes
`public/bawean-menfess-logo1.png`.

## Safe first-release sequence

1. **PENDING USER APPROVAL:** review the exact diff and approve the release
   commit. Commit only the approved manifest; do not include the alternative
   logo or ignored local files.
2. **PENDING USER APPROVAL:** enable Vercel Authentication for all deployments,
   including production domains. Verify the setting read-only before the
   release proceeds.
3. Re-run the quality gates on the committed SHA. Verify `HEAD`, the reviewed
   SHA, and the intended push target match.
4. **PENDING USER APPROVAL:** push the approved SHA. Because `main` is the
   production branch and automatic domain assignment is enabled, treat a push
   to `main` as deployment authorization.
5. Monitor the new Vercel deployment until `READY`, `ERROR`, or `CANCELED`.
   Verify project/team IDs, Git SHA, environment `production`, build logs, and
   certificate-file tracing. Do not force-promote a failed build.
6. While Vercel protection still covers the production domain, perform the
   read-only smoke tests below. Do not submit a menfess or call tracking/rate-
   limited POST endpoints.
7. **PENDING USER APPROVAL:** execute the first-admin procedure in
   `ADMINISTRATOR_SETUP.md` from a trusted operator workstation.
8. Verify admin login, `/api/admin/session`, dashboard loading, queue reads, and
   logout. A moderation mutation requires separate approval and a deliberately
   created test record; it is not part of the read-only smoke test.
9. Verify monitoring ownership and that a moderator is available.
10. **PENDING USER APPROVAL:** remove temporary all-deployments protection to
    launch publicly. Recheck the production alias and public routes.
11. Monitor Vercel function errors, Supabase/Postgres health, authentication
    failures, rate-limit behavior, and moderation backlog during the launch
    window.

For an explicitly staged CLI release, `vercel deploy --prod --skip-domain`
creates a production-configured deployment without assigning the production
domain. This still requires deployment approval. The generated URL may be
used for unauthenticated read-only checks under Vercel protection, but Better
Auth is bound to the production origin, so this staged URL is not sufficient
to prove production-origin admin login. Keep all-deployments protection through
the eventual domain assignment and complete the login check there.

## Read-only production smoke tests

Run only after a deployment exists and verify response headers as well as
content:

| Check | Expected result | Additional approval |
| --- | --- | --- |
| `GET /` | Landing page and official logo render | No |
| `GET /kirim` | Form renders; do not submit | No |
| `GET /lacak` | Tracking form renders; do not query | No |
| `GET /tentang` | About page renders | No |
| `GET /api/public/categories` | Five public category slug/label pairs; no private fields | No |
| `GET /admin` unauthenticated | Redirect to `/admin/login` | No |
| `GET /api/admin/session` unauthenticated | `401`, no-store headers | No |
| `POST /api/auth/sign-up/email` with inert test input | `404`; no account creation | Explicit approval before any production POST, even though the route is disabled |
| Static logo/decor assets | `200`, correct content types | No |
| Security headers/cookies | No-store on private APIs; admin cookie `Secure`, `HttpOnly`, `SameSite=Lax` after approved login | Admin bootstrap/login approval |
| Responsive rendering | Desktop and 390px layouts have no horizontal overflow | No |

Do not call `/api/public/menfess` or `/api/public/track` during a read-only smoke
test. Authenticated dashboard and moderation checks require the approved admin
bootstrap. Status-changing moderation is outside this checklist.

## Rollback and incident handling

This is the first deployment, so no known-good production deployment exists.
Do not describe rollback as an instant version restore.

- **Build/deployment failure before domain assignment:** cancel the failed
  deployment if authorized, keep production protection and the domain off the
  failed deployment, inspect logs, and fix forward.
- **Failure after first domain assignment:** immediately restore all-deployments
  protection or remove the production alias only with emergency approval.
  Preserve evidence, then fix forward. There may be no older deployment to
  promote.
- **Database connectivity/TLS failure:** do not weaken TLS or substitute the
  `postgres` migration role. Keep the site protected, verify CA packaging,
  pooler reachability, runtime role, and `DATABASE_URL`, then redeploy the fix.
- **Better Auth URL/secret or cookie failure:** keep the domain protected,
  verify Production scope and exact origin without exposing values, correct
  configuration only with approval, and redeploy.
- **Moderator login failure:** do not create another admin blindly. Read-only
  verify the admin/account state, distinguish credential failure from runtime
  configuration failure, and follow the bootstrap failure guidance.
- **Moderation-action failure:** stop mutations, preserve the append-only audit
  log, inspect function/database logs, and fix forward. Do not edit audit
  history or manually force status transitions.
- **Accidental public exposure:** enable all-deployments protection first,
  preserve logs, assess whether submissions arrived, assign moderation
  ownership, and obtain incident-response approval before any data changes.
- **Missing environment configuration:** keep the deployment protected; add or
  correct only the approved Production variable and redeploy. Never add
  `DIRECT_URL` to application runtime.

The D1 and D2 migrations predate this application release and are verified.
This release introduces no D3 migration. Do not roll back production database
migrations automatically as an application rollback technique.
