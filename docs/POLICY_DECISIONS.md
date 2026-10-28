# P7 policy decision record

## Owner-approved decisions

The owner approved the community-content, moderation, publication, retention,
idempotency, incident, and privacy implementation targets on 2026-10-28.
The public contact is `dimasabdussyukur@gmail.com`; the public community name is
Bawean Menfess and is not a verified legal-operator identity.

Approved retention targets are 90 days from submission for `PENDING`, 90 days
from the applicable moderation action for `APPROVED` and `REJECTED`, and 365
days from publication for `PUBLISHED`. A legal hold overrides cleanup. Tracking
digests and linked audit records are removed with the menfess. Cleanup delays
caused by infrastructure failure are possible and no strict deletion deadline
is promised.

Identical retries may replay for 24 hours. After that boundary the same key is
rejected; an intentional new submission requires a new key.

Published-content reports do not require tracking credentials. Removal is
reviewed manually, recorded separately, and does not add a fifth lifecycle
state. No anonymous appeal or post-submission editing is offered for the MVP.

## Implemented locally, not yet operational in production

- Final rules/privacy wording and submission consent.
- Database migration for legal holds, publication-removal evidence, and an
  owner-only transactional retention function.
- Owner-only bounded cleanup of expired rate-limit rows.
- 24-hour idempotency replay boundary.

These are not production capabilities until the migration and application
release receive separate approval, are deployed, and are verified.

## Remaining launch gates

- Assign a backup incident owner.
- Verify the project's actual Supabase plan, backup inventory, recovery window,
  PITR state, and restoration procedure; conduct an authorized restore test.
- Arrange owner-only scheduled cleanup and monitoring after migration approval.
- Obtain appropriate Indonesian legal/PSE review covering lawful processing,
  operator identification, data-subject requests, minors/sensitive data,
  cross-border processing, UGC reports, and takedown obligations.

