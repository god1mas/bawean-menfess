# Moderation workflow

## Dashboard

The authenticated `/admin` dashboard provides submission totals, pending and
rejected counts, combined approved/published totals, recent audit activity, and
a paginated moderation queue. Administrators can filter by status and category,
search submitted text, and sort by submission date. Detail view includes the
full message, category, submission date, current version/status, and append-only
moderation history. Tracking credentials are intentionally irrecoverable and
are never displayed to moderators.

## Allowed lifecycle

The existing D1 database model is authoritative:

| Current status | Action | Result |
| --- | --- | --- |
| `PENDING` | Approve | `APPROVED` |
| `PENDING` | Reject with a reason | `REJECTED` |
| `APPROVED` | Mark published | `PUBLISHED` |

Other transitions are rejected. Unpublishing is not supported by the existing
schema and no moderation action for it is exposed. Publishing is an
administrator-recorded status change; it does not post to Instagram or any
other external service.

## Mutation guarantees

Every request is authorized from a fresh Better Auth session and a
server-side role lookup. The actor ID always comes from that verified session,
not the request body. Mutation requests must have the configured same Origin,
use a bounded strict JSON schema, and include the version displayed to the
administrator.

The server performs the status/version update and audit insert in one
transaction. The update predicates on the current status and expected version;
the database also enforces valid transitions and audit consistency. A stale
version or a concurrent decision produces a conflict and no duplicate audit
entry. Rejection requires a nonblank reason recorded in the append-only
moderation log.

The public tracking API continues to reveal status only. It never returns
moderation notes, administrator identity, private message details, or database
identifiers.
