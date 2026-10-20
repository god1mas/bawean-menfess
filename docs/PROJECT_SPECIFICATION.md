# Bawean Menfess — Project Specification

## 1. Document status

- Status: D0 baseline
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
4. A sender receives a private tracking code after a successful submission.
5. The experience must remain welcoming, readable, responsive, and accessible.
6. Secrets, privileged keys, and moderation capabilities must never be exposed
   to the browser.

## 3. Users and roles

### Public visitor

- Reads the landing and about content.
- Submits a menfess anonymously.
- Tracks a submission using its private tracking code.
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

- Categories shown in the design: `Curhat`, `Tanya`, `Apresiasi`, and `Info`.
- Menfess message is required and visually limited to 1,000 characters.
- Pseudonym is optional.
- Community-rules/moderation consent is required before submission.
- A successful request returns a private tracking code.
- The interface must warn senders not to include another person's private
  information.
- Submission must be validated server-side even when client validation exists.

### Track menfess

- Accept a private code in the displayed `BM-XXXXXXXX` style.
- Do not expose submission content or personal data merely from a tracking
  lookup.
- Display the current lifecycle state in plain Indonesian.
- The visual baseline includes `Diterima`, `Dalam moderasi`, and
  `Dipublikasikan`.

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
- Show a filterable moderation list with tracking code, category, excerpt, and
  status.
- Allow an authorized administrator to inspect a submission before deciding.
- Moderation and publication actions must be auditable and safe to retry.
- Destructive or irreversible actions require explicit confirmation.

The Figma dashboard contains illustrative data only and must never ship as
production records.

## 6. Submission lifecycle

The baseline state model is:

```text
received → in_review → approved → published
                    ↘ rejected
```

- `received`: accepted by the server and assigned a tracking code.
- `in_review`: being assessed by a moderator.
- `approved`: accepted for publication but not yet confirmed as published.
- `published`: publication has been confirmed.
- `rejected`: not approved for publication.

Exact transition permissions, resubmission behavior, and the public wording for
`approved` and `rejected` require confirmation before those flows are built.

## 7. Conceptual data model

This is a conceptual contract, not a Prisma schema.

### Menfess

- Internal identifier
- Public tracking code (unique, non-sequential, unguessable)
- Category
- Message
- Optional pseudonym
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
- Tracking codes must have sufficient entropy and must be compared without
  leaking unrelated records.
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

Service connections, schema migrations, authentication, persistence, and
deployment are deferred beyond D0.

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
- Whether Instagram publication is manual or API-driven and how publication is
  confirmed.
- Tracking-code length, alphabet, expiry, recovery, and brute-force policy.
- Data retention, deletion, backups, analytics, abuse telemetry, and legal
  privacy text.
- Administrator provisioning, role granularity, recovery, and MFA policy.
- Production domains, contact details, Instagram URL, and support workflow.
- Final route names and metadata beyond the D0 landing placeholder.

## 14. Phase boundary

D0 provides tooling, branding, documentation, and verification only. It does
not authorize implementation of the public screens, database, authentication,
moderation workflow, tracking API, Instagram integration, or deployment.
