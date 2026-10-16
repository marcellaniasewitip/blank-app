# Security review notes (Phase 1)

| Area | Control |
| --- | --- |
| AuthN | Phone OTP (6 digits, hashed, single use, 5 attempts, 5-min TTL, per-phone + per-IP send limits). JWT access 15 min; opaque refresh tokens stored hashed, rotated, reuse revokes the family. Admin: bcrypt(12) passwords (≥12 chars), optional TOTP (MFA token can't call APIs). |
| AuthZ | Global fail-closed guard: every route must be `@Public`, `@Roles(customer/driver)` or `@RequirePermissions`. Ownership checks on every customer/driver resource (404 on others' data). |
| Input | class-validator DTOs with whitelist + forbidNonWhitelisted; UUID param pipes; 1 MB JSON limit. |
| Money | Integer toea only; append-only ledger enforced by DB trigger; idempotency keys on every entry; all changes in transactions with row locks. |
| Webhooks | Signature verified (HMAC for mock; provider-specific for real), raw payload stored, dedupe on event id, processing idempotent on provider_ref. |
| Files | Presigned S3 PUT/GET only (10 min / 5 min), content-type + size allow-list, keys scoped to `<folder>/<ownerId>/` and checked on submit. Bucket private, TLS-only. |
| PII | Customer/driver phone shown to the counterparty only while an order is active; admin PII screens behind `customers.view` / `drivers.view`. |
| Audit | Every admin action (incl. failed logins) → `audit_logs` with before/after; secrets redacted. |
| Transport | HTTPS via ALB (TLS 1.2+), RDS forced SSL, Redis TLS + AUTH. Helmet headers; CORS limited to admin origins. |
| Secrets | Env vars from Secrets Manager only; prod refuses the dev webhook secret; Swagger disabled in production; mock payments blocked in production. |
| CSV | Formula-injection neutralised in exports. |

Known follow-ups: WAF in front of the ALB (rate-based rule on `/api/v1/auth/*`); device attestation (Play Integrity) for the apps; penetration test before go-live.
