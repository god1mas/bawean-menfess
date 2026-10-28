# P7.1 consolidated remediation

## Scope and status

This document records the local P7.1 remediation. It is not a production
deployment record. No migration, seed, administrator change, environment
change, or deployment is authorized by this document.

## Implemented technical corrections

- Administrator email/password sign-in now uses Better Auth's canonical HTTP
  route and durable PostgreSQL custom rate-limit storage: five attempts per
  fixed 15-minute window. Limiter keys are domain-separated HMAC digests; raw
  addresses, emails, and passwords are not stored.
- Approve, reject, and publish actions require accessible, action-specific
  confirmation. Duplicate confirmation is locked, failure remains visible,
  and a failed post-success refresh cannot cause the mutation to be retried.
- Submission retries use a browser-generated 256-bit idempotency key. Tracking
  credentials are deterministically derived with separate server HMAC keys,
  and only their existing digests are persisted.
- Dashboard counts separate approved-but-unpublished from published records.
- Publication accepts an optional canonical HTTPS Instagram post, reel, or TV
  reference and records it through the existing publication field and audit
  note. There is no Instagram API integration.
- Clipboard failures retain selectable tracking credentials, and public forms
  safely handle non-JSON, malformed, network, and timeout responses.
- Standard ESLint ignores only generated `.vercel` output.

## Database deployment prerequisite

Application deployment requires the reviewed migration
`20261027130000_add_admin_login_rate_limiting` to be applied first through the
`postgres` migration-owner connection. The migration extends the existing
scope check, replaces the private `SECURITY DEFINER` function with the compiled
`admin-login` limit, revokes execution from all broad roles, and grants only
the exact function signature to `bawean_app`. It grants no direct table access.
Its current SHA-256 is
`4391fe90f665b9e44aa97743af9605848548eb16b5aa7776c91a91ef662494cf`.

The migration has no Prisma model change because it alters the accepted values
of an existing database check constraint and function. If rollback is needed,
roll back application code first, then use a new reviewed forward migration to
restore the two-scope function and constraint. Do not edit migration history or
modify an already-applied migration.

## Unresolved owner decisions

The structural `/aturan` and `/privasi` drafts do not constitute approved
policy. Public launch remains blocked by the decisions in
[`POLICY_DECISIONS.md`](POLICY_DECISIONS.md), including content rules,
retention/deletion, contact and incident procedures, legal review, and the
idempotency replay lifetime.
