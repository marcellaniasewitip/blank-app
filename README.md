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

## Build status

| Part | Verified |
| --- | --- |
| Backend | lint, typecheck, 133 unit + integration tests, end-to-end simulator (real BullMQ + WebSockets), Docker image run (migrate/seed/API/worker), k6 load test |
| Admin | typecheck, lint, 86 unit tests, production build, Docker image, Playwright check of every screen |
| Infra | `terraform validate`, `docker compose config` |
| Android | Non-UI core and ViewModels compiled and tested on the JVM (35 + 15 tests, plus a live smoke test against the API). **The full Android build (`./gradlew :app:assembleDebug test`) has not run yet** — the development sandbox couldn't reach Google Maven. The `android` CI job runs it on GitHub; expect a round of Compose compile fixes on first build. |
