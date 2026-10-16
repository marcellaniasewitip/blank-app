# Cooper Waters — Admin Dashboard

React 18 + TypeScript (strict) + Vite web app for Cooper Waters staff: orders, drivers, fleet,
depots, pricing, money queues (top-ups, cell money reconciliation, refunds, payouts), disputes,
notification templates, RBAC and reports. It talks to the backend REST API (`/api/v1`) and the
Socket.IO `/realtime` namespace.

Stack: Mantine 7 (UI, forms, dates, charts), React Router 6, TanStack Query 5, socket.io-client 4,
Leaflet + react-leaflet (map editor / live fleet), qrcode.react (TOTP setup), Vitest, ESLint 9.

## Run locally

```bash
cd admin
npm ci
cp .env.example .env.local      # adjust VITE_API_BASE_URL if the API is not on :3100
npm run dev                     # http://localhost:5173 (the backend's CORS_ORIGINS must include it)
```

Sign in with a seeded admin, e.g. `super.admin@cooperwaters.com.pg` / `CooperWaters2024!`
(also `operations@`, `finance@`, `support@` — each sees only what their role permits).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Type-check, then build static files into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` (request DTO types) from `../shared/openapi.json` |

## Environment variables (baked in at build time)

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3100` | Backend origin, no trailing slash. REST = `<base>/api/v1`, Socket.IO = `<base>/realtime` |
| `VITE_MAP_TILE_URL` | OpenStreetMap tiles | Leaflet tile URL template. The map provider is still **[CONFIRM]**; change it here only |
| `VITE_MAP_ATTRIBUTION` | `© OpenStreetMap contributors` | Tile attribution |
| `VITE_BASE_PATH` | `/` | Public path when hosted under a sub-path (e.g. `/admin/`) |

## Deploy

### AWS (S3 + CloudFront) — production target

`npm run build` produces self-contained static files in `dist/` (`index.html` + fingerprinted
`assets/`). Hidden source maps (`*.map`) are emitted for error tracking — don't upload them publicly.

```bash
VITE_API_BASE_URL=https://api.cooperwaters.com.pg npm run build
aws s3 sync dist/assets s3://<bucket>/assets --cache-control "public,max-age=31536000,immutable" --exclude "*.map"
aws s3 cp dist/index.html s3://<bucket>/index.html --cache-control "no-cache"
aws s3 cp dist/favicon.svg s3://<bucket>/favicon.svg
aws cloudfront create-invalidation --distribution-id <id> --paths /index.html
```

CloudFront: set the default root object to `index.html` and add custom error responses mapping
403 and 404 to `/index.html` with status 200 (SPA deep links such as `/orders/<id>`). Add the
CloudFront domain to the backend's `CORS_ORIGINS`.

### Container

```bash
docker build -t cooper-waters-admin --build-arg VITE_API_BASE_URL=https://api.example.com .
docker run -p 8080:80 cooper-waters-admin     # http://localhost:8080, health: /healthz
```

Multi-stage: `node:20-alpine` builds, `nginx:alpine` serves with SPA fallback (`nginx.conf`).

## Structure

```
src/
  api/          client.ts (fetch wrapper, error envelope, single-flight token refresh),
                index.ts (typed endpoint functions), types.ts (response types mirroring backend views),
                schema.d.ts (generated request DTOs), tokenStore.ts
  auth/         AuthContext (session, /auth/admin/me), permissions.ts (permission gating helpers)
  realtime/     RealtimeProvider (Socket.IO: order.updated, fleet.driver_location), fleet.ts
  components/   AppLayout, Guards, ActionModal (confirm + reason/ref prompts), Ledger (+ wallet
                adjustment), MapBase, JsonDiff, DateRange, CursorList (Load more), badges, …
  pages/        one file per screen (lazy-loaded)
  lib/          money (Kina ↔ toea), gsm7 (SMS checks), time (Port Moresby), idempotency, geo, …
  i18n/         en.ts — every user-facing string; add another catalogue with the same shape
  nav.tsx       navigation + required permission per item
```

## Conventions

- **Money** is integer toea everywhere. `formatKina(12550)` → `K125.50`. Kina inputs are parsed
  from the string (`parseKinaToToea('12.50')` → `1250`) — no floating-point maths.
- **Times** come from the API in UTC and are displayed in `Pacific/Port_Moresby` (UTC+10, no DST).
  Date filters are Port Moresby calendar days.
- **Auth**: access + rotating refresh token in `localStorage` (shared across tabs). Concurrent 401s
  share one refresh; a Web Locks mutex plus a storage re-read stops two tabs spending the same
  refresh token (the backend revokes all sessions on reuse).
- **Permissions**: nav items, routes and action buttons are hidden unless the admin's role has
  the permission (`auth/permissions.ts`); the backend enforces them too.
- **Idempotency**: manual wallet adjustments send an `Idempotency-Key` (UUID) generated per action
  and reused when the same request is retried.
- **Realtime**: order lists/details and the fleet map update from Socket.IO; when the socket is
  down the header shows "Offline — polling" and pages poll instead.
- **Lists** use the backend's cursor pagination with a "Load more" button.

## Known backend gaps (affect this dashboard)

- `GET /admin/topups` returns `proofFileKey` but no signed URL, so top-up proof images can't be
  previewed (the UI shows that a proof exists and uses `proofUrl` automatically if added).
- `/auth/*` is throttled at 10 requests/minute per IP, including `GET /auth/admin/me` and
  `POST /auth/refresh`; several admins behind one office NAT, or many hard reloads, hit 429.
  The dashboard retries 429s with backoff and shows a retry screen.
- `payment.cellmoney.adapter` accepts any string; an unknown adapter name breaks new payments.
