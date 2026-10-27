# Security risk acceptance

## Decision record

| Field | Value |
| --- | --- |
| Status | **ACCEPTED WITH CONDITIONS** |
| Owner approval date | 2026-10-23 |
| Last revalidated | 2026-10-27 |
| Advisory | `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687` |
| Severity | HIGH |
| Resolution state | **Not fixed**; accepted temporarily under the controls below |

This record implements the owner's approved Option B conditional risk
acceptance. It does not suppress `npm audit`, change severity, or assert that
the affected packages are safe.

## Finding and exposure

The current development dependency path is:

```text
eslint-config-next
  -> @next/eslint-plugin-next
  -> fast-glob
  -> micromatch
  -> braces 3.0.3
```

The advisory concerns uncontrolled recursion while processing sufficiently
deeply nested brace patterns. A crafted glob can exhaust the JavaScript call
stack and terminate or stall the lint process, producing a denial of service.
The five HIGH entries reported by npm are transitive package records for this
one underlying advisory.

`npm audit --omit=dev` reports zero vulnerabilities. The affected chain is
used by ESLint during development and CI; repository review found no
production request handler that invokes ESLint, `fast-glob`, `micromatch`, or
`braces`. The accepted assessment is therefore:

- **Production runtime exposure:** no demonstrated request path.
- **Developer/CI exposure:** present when linting attacker-controlled
  configuration or glob input, including changes that influence
  `settings.next.rootDir`.
- **Impact:** loss of availability for the lint process or CI worker; impact
  increases if that worker also has privileged credentials or broad access.

At revalidation, npm proposed a forced downgrade to
`eslint-config-next@14.2.35`, which is incompatible with the Next.js 16.4.2
toolchain. No compatible patched dependency path was verified, and no unsafe
override was applied.

## Required compensating controls

1. Do not lint untrusted repository configuration on privileged workstations.
2. Run future pull-request checks in isolated, unprivileged, disposable
   environments.
3. Never expose production secrets or write-capable tokens to untrusted PR
   jobs.
4. Require review for ESLint configuration changes, especially changes to
   `settings.next.rootDir` or glob inputs.
5. Pin dependencies through the reviewed lockfile; do not run automatic
   forced audit fixes.
6. Keep lint jobs bounded by CI time and resource limits.
7. Monitor upstream `braces`, `micromatch`, `fast-glob`, and Next.js ESLint
   releases.
8. Run both `npm audit` and `npm audit --omit=dev` before each release.

## Acceptance invalidation and reassessment

This acceptance expires and the release must be reassessed if any of the
following occurs:

- a compatible patched release becomes available;
- the affected packages move into production dependencies or a runtime path;
- linting begins to process untrusted configuration or user-controlled globs;
- CI gains production secrets, write-capable tokens, or non-disposable
  privileged runners;
- exploit evidence changes the understood impact or reachability;
- the dependency chain, application architecture, or CI trust boundary
  changes materially.

Track the advisory during routine dependency updates and record the next
review in the release evidence. Removal of the vulnerable chain is preferred
as soon as a compatible fix exists.
