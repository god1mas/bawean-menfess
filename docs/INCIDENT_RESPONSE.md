# Security incident response runbook

Primary owner: project owner. Backup owner: **not assigned (launch blocker)**.

1. Contain the incident and stop unsafe processing without destroying evidence.
2. Preserve UTC timestamps, affected systems, observed impact, and authorized
   actions; exclude unnecessary message content and secrets.
3. Revoke compromised sessions and rotate affected credentials.
4. Assess affected data, people, time window, and continuing risk. Obtain
   appropriate Indonesian legal advice before deciding notices.
5. Provide notices required by applicable law; do not promise an unverified
   response or recovery time.
6. Recover from a verified state. After a database restore, follow the deletion
   reapplication procedure in `RETENTION_OPERATIONS.md`.
7. Document lessons, corrective actions, owners, and follow-up verification.

Never include passwords, session tokens, HMAC keys, tracking credentials, or
full private submissions in incident tickets or general-purpose logs.

