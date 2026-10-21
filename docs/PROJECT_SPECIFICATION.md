# Bawean Menfess — Project Specification

## 1. Document status

- Status: D1 requirements baseline
- Last updated: 21 October 2026
- Product: Bawean Menfess
- Purpose: anonymous community confession and message platform for people in
  Bawean and the diaspora
- Visual source of truth: the supplied Figma file
- Functional source: the supplied project brief plus behavior explicitly shown
  in the referenced Figma frames

This document records the implementation baseline for future phases. Items in
the **Open decisions** section are not approved behavior and must not be guessed
during implementation.

## 2. Product principles

1. People can submit a story without creating a public account.
2. A sender's identity is not displayed with published content.
3. Every submission is moderated before publication.
4. A sender receives two independent private tracking credentials after a
   successful submission: a human-readable code and a secure URL token. Only
   versioned keyed digests of those credentials are persisted.
5. The experience must remain welcoming, readable, responsive, and accessible.
6. Secrets, privileged keys, and moderation capabilities must never be exposed
   to the browser.

## 3. Users and roles

### Public visitor

- Reads the landing and about content.
- Submits a menfess anonymously.
- Tracks a submission using either its private human-readable code or its
  secure tracking link.
- Does not require an account in the current design.

### Administrator

- Authenticates through the admin login.
- Reviews the moderation summary and submission queue.
- Filters and reviews submissions by moderation status.
- Performs only actions authorized by the eventual admin role model.

No additional staff roles or public user accounts are specified yet.

## 4. Public experience

### Landing

- Explain Bawean Menfess and its privacy/moderation promise.
- Provide clear actions to submit or track a menfess.
- Present the primary categories and the four-step process: write, submit,
  moderate, publish.
- Link to about, community rules, privacy information, and Instagram when those
  destinations are defined.

### Submit menfess

- Approved categories: `Confess`, `Curhat`, `Ask BM`, `Connect`, and `Discuss`.
- Menfess message is required and visually limited to 1,000 characters.
- The Figma submit form shows an optional pseudonym, but that field is not part
  of the original approved functional decisions. It remains unresolved and
  must not be persisted until product approval.
- Community-rules/moderation consent is required before submission.
- A successful request returns the private human-readable tracking code and
  secure tracking URL once.
- The interface must warn senders not to include another person's private
  information.
- Submission must be validated server-side even when client validation exists.

### Track menfess

- Accept either a human-readable tracking code or a separate secure URL token.
  Both must be generated cryptographically and stored only as versioned HMAC
  digests. The short `BM-XXXXXXXX` example in Figma is illustrative; its exact
  alphabet and length remain unresolved.
- Do not expose submission content or personal data merely from a tracking
  lookup.
- Display the current lifecycle state in plain Indonesian.
- The visual baseline includes `Diterima`, `Dalam moderasi`, and
  `Dipublikasikan`. `Diterima` and `Dalam moderasi` are presentation labels for
  the single approved `PENDING` state, not additional database states.

### About

- Explain the community purpose and Bawean focus.
- Communicate the principles of privacy, mutual respect, and moderation.
- Provide a clear route back to submission.

## 5. Administration experience

### Admin login

- Email and password fields are shown in the design.
- Authentication will use Better Auth in a later phase.
- Login errors must not reveal whether a particular administrator exists.
- Admin sessions and routes must be protected server-side.

### Dashboard and moderation

- Show summary counts for pending, approved, published, and rejected items.
- Show a filterable moderation list with an internal identifier, category,
  excerpt, and status. The two private tracking credentials must never be
  displayed to administrators or stored in plaintext. The exact identifier
  presentation remains unresolved.
- Allow an authorized administrator to inspect a submission before deciding.
- Moderation and publication actions must be auditable and safe to retry.
- Instagram publication is manual. Marking a submission as published records
  the administrator, timestamp, and optional Instagram reference; it does not
  call the Instagram API.
- Destructive or irreversible actions require explicit confirmation.

The Figma dashboard contains illustrative data only and must never ship as
production records.

## 6. Submission lifecycle

The approved state model is:

```text
PENDING → APPROVED → PUBLISHED
       ↘ REJECTED
```

- `PENDING`: accepted by the server and awaiting or undergoing moderation.
- `APPROVED`: accepted for publication but not yet confirmed as published.
- `PUBLISHED`: manual Instagram publication has been confirmed.
- `REJECTED`: not approved for publication.

The forward-only transitions above are the Task 1.1 recommendation. Reopening,
resubmission, and reversal behavior require confirmation before implementation.

## 7. Conceptual data model

This remains the approved conceptual contract. The Task 1.3A executable schema
and deployed initial migration are documented in
[`PRISMA_SCHEMA.md`](PRISMA_SCHEMA.md).

### Menfess

- Internal identifier
- Human-readable tracking-code HMAC digest and key version
- Secure tracking-URL-token HMAC digest and key version
- Category
- Message
- Optional pseudonym only if the unresolved Figma field is approved
- Moderation status
- Submission and update timestamps
- Optional publication timestamp and publication reference

### Moderation event

- Submission reference
- Administrator reference
- Previous and new status
- Optional internal moderation note
- Timestamp

### Administrator identity

- Better Auth identity reference
- Authorization role or permission set
- Created/updated timestamps as required by the auth implementation

Do not store sender identity or additional telemetry unless a later approved
requirement establishes a lawful purpose and retention policy.

## 8. Security and privacy requirements

- Validate all public inputs with Zod on trusted server boundaries.
- Rate-limit submission, tracking, and authentication endpoints with Upstash
  Redis.
- Keep database, Better Auth, Supabase secret/service-role, and Upstash tokens
  server-only.
- Only Supabase's publishable browser key may use a `NEXT_PUBLIC_` prefix.
- Enable Row Level Security for every table exposed through the Supabase Data
  API; admin access must still enforce authorization.
- Both tracking credentials must use a cryptographically secure random
  generator, be stored only as separate versioned HMAC digests, and never
  appear in application logs or analytics. URL tokens must not use query
  strings and require explicit referrer/log-redaction controls.
- Sanitize or safely render user-authored content; do not interpret it as HTML.
- Record moderation changes without placing sensitive message content in logs.
- Apply CSRF, session, cookie, and login throttling protections appropriate to
  the final Better Auth architecture.
- Define data retention, deletion, incident response, and privacy contact
  policies before production launch.

## 9. Accessibility and responsive behavior

- Match the desktop, mobile, and admin Figma frames without using screenshots
  as page backgrounds.
- Use semantic landmarks, headings, labels, buttons, and form error messaging.
- All controls must be keyboard operable with visible focus states.
- Meet WCAG AA contrast for text and interactive states.
- Preserve readable layouts from 320 px upward.
- Respect reduced-motion preferences if motion is introduced later.

## 10. Technical baseline

- Next.js App Router
- React and strict TypeScript
- Tailwind CSS
- PostgreSQL on Supabase
- Prisma ORM
- Better Auth
- Upstash Redis
- Zod
- Vitest and Playwright
- Vercel deployment target

The D1 database architecture and initial schema are deployed. Admin-only
authentication and authorization are implemented. Public menfess persistence,
moderation workflows, and deployment remain deferred to their separately
approved phases.

## 11. Design references

Figma: <https://www.figma.com/design/l5lV9FukNVG2sIeKoParEg/Untitled>

| Screen | Node |
| --- | --- |
| Desktop Landing | `4:3` |
| Desktop Submit | `8:2` |
| Desktop Tracking | `8:47` |
| Desktop About | `8:89` |
| Mobile Landing | `9:3` |
| Mobile Submit | `9:56` |
| Mobile Tracking | `9:90` |
| Admin Dashboard | `10:3` |
| Admin Login | `10:80` |

Official logo: `public/bawean-menfess-logo.png`, exported from Figma node
`4:34` at 4× resolution (1280×1280). It must not be regenerated or replaced
with a look-alike.

## 12. Verification expectations

Each implementation phase must conclude with:

1. Lint and strict TypeScript checks.
2. Relevant unit tests.
3. A production build.
4. Playwright coverage for affected user journeys.
5. Visual comparison against the relevant Figma screenshots.
6. Secret and repository-status checks before any commit or push.

## 13. Open decisions

The following require product confirmation before affected features are built:

- Final community rules and prohibited-content policy.
- Moderation rejection reasons, appeals, edits, and resubmission behavior.
- What a sender sees when a submission is approved or rejected; the public
  tracking design currently illustrates only three positive stages while the
  admin design includes a rejected state.
- Whether the optional Figma pseudonym field is in scope, including its maximum
  length, public display behavior, moderation, and retention.
- Whether moderators may reverse or reopen a decision; the current proposal is
  forward-only.
- Exact human-readable tracking-code alphabet, grouping, and length, subject to
  the minimum entropy in the D1 architecture report.
- Tracking-credential expiry and recovery.
- Data retention, deletion, backups, analytics, abuse telemetry, and legal
  privacy text.
- Administrator provisioning, role granularity, recovery, and MFA policy.
- Production domains, contact details, Instagram URL, and support workflow.
- Final route names and metadata beyond the D0 landing placeholder.

## 14. D1 database references

The Task 1.1 database proposal, ERD, conceptual Prisma models, constraints, and
security review are recorded in
[`docs/DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md). It is a planning
artifact only and does not authorize a migration or external service setup.

The verified Supabase connection configuration is recorded in
[`DATABASE_CONNECTION.md`](DATABASE_CONNECTION.md). The Prisma 7 schema,
Better Auth model reconciliation, and deployed initial migration are recorded
in [`PRISMA_SCHEMA.md`](PRISMA_SCHEMA.md).

## 15. Phase boundary

D1.3F and D1.4–D1.6 approvals authorized the database migration and admin-only
authentication foundation. No category seed, production admin account, public
submission workflow, Instagram integration, or deployment is authorized by
those completed tasks.
