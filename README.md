# Cooper Waters — Phase 1

On-demand water delivery marketplace for Port Moresby, PNG. Customers order water; independent water-cart
drivers accept and deliver. Built from `COOPER_WATERS_SPEC.md` (Phase 1 MVP).

| Path | What |
| --- | --- |
| `backend/` | NestJS + TypeScript API, dispatch engine, wallets/ledger, payments, notifications, BullMQ workers |
| `admin/` | React + TypeScript (Vite) admin dashboard |
| `customer-android/` | Customer app (Kotlin, Jetpack Compose) |
| `driver-android/` | Driver app (Kotlin, Jetpack Compose) |
| `shared/` | `openapi.json` (the API contract) and `android-core` (shared Android API client module) |
| `infra/` | `docker-compose.yml`, AWS Terraform (`infra/terraform`), k6 load test |
| `docs/` | Architecture, AWS deployment runbook, operations runbook, open decisions, UAT checklist, ADRs |

## Quick start (local)

```bash
docker compose -f infra/docker-compose.yml up --build -d
docker compose -f infra/docker-compose.yml run --rm seed
# API     http://localhost:3000   (Swagger: /api/docs, health: /health)
# Admin   http://localhost:8080   super.admin@cooperwaters.com.pg / CooperWaters2024!
```

Or without Docker (Postgres 16 + PostGIS and Redis running locally):

```bash
cd backend && cp .env.example .env && npm ci
npx prisma migrate deploy && npm run seed
npm run dev            # API + workers on :3000
npm test               # unit + integration tests (needs a cooper_test database)
npm run simulate       # full order end-to-end against the mock providers
```

Mobile apps: see `customer-android/README.md` and `driver-android/README.md`.

## Deploying to AWS

Region `ap-southeast-2` (Sydney). See **[docs/deployment-aws.md](docs/deployment-aws.md)** — Terraform creates the
infrastructure; the `Deploy to AWS` GitHub Actions workflow builds, migrates and rolls out on every push to `main`.

## Key rules baked in

- Money is integer **toea** everywhere (1 PGK = 100 toea); ledger is append-only (DB trigger).
- Timestamps stored UTC, displayed `Pacific/Port_Moresby`.
- `Idempotency-Key` required on create order, initiate payment, top-up, withdrawal and accept.
- All `[CONFIRM]` business decisions are admin-editable settings or provider adapters —
  see **[docs/open-decisions.md](docs/open-decisions.md)**.
