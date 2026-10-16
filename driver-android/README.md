# Cooper Waters — Driver App (Android)

Native Android app for independent water-cart drivers: onboarding (documents + truck), going online at a depot,
receiving and accepting job offers, running the job (load at depot → deliver), wallet (top-up, withdrawal),
earnings and job history.

Kotlin · Jetpack Compose (Material 3) · minSdk 24 · target/compile SDK 35 · Java 17 bytecode · Gradle 8.14.3 wrapper ·
version catalog in `gradle/libs.versions.toml` (keep identical to `customer-android`'s).

## Modules

| Module | Path | What |
| --- | --- | --- |
| `:app` | `app/` | Driver screens, ViewModels, location foreground service, push service |
| `:core` | `../shared/android-core` | Shared API client, models, auth, idempotent queue, Socket.IO, cache, formatting, map wrapper, UI kit |

## Build & run

```bash
cd driver-android
echo "sdk.dir=$ANDROID_HOME" > local.properties     # gitignored
./gradlew :app:assembleDebug
./gradlew test                                       # core + app JVM unit tests
./gradlew :app:installDebug
```

## Configuration

Same as the customer app: `cw.apiBaseUrl` / `cw.apiBaseUrlRelease` Gradle properties (default `http://10.0.2.2:3100`,
no `/api/v1`), debug-only server field on the sign-in screen, cleartext only in debug, optional `app/google-services.json`
(plugin applied only if the file exists; token registered with `PUT /driver/me/push-token`), `CrashReporter` with a
Sentry TODO, osmdroid maps behind `CwMap`.

Seed drivers (local backend): `+67570000001` … `+67570000005` (approved, K200 wallet). Going online is depot-gated:
in the emulator set the location to a depot (e.g. Town Depot −9.4438, 147.1803; Gerehu Depot −9.402, 147.162).

Permissions: location (fine/coarse), foreground service (location type), notifications. No CAMERA permission — photos
are taken by the system camera app (`ACTION_IMAGE_CAPTURE` into a FileProvider URI) or picked from the gallery.

## Screens (spec §10)

Phone + OTP (+ name on first sign-in) · onboarding: upload each required document from `GET /driver/config`
(camera or gallery, compressed to ≈1600 px JPEG before upload via `POST /driver/uploads` → pre-signed PUT →
`POST /driver/documents`) + truck registration (`PUT /driver/truck`, optional truck photo) · waiting-for-approval
(polls `GET /driver/me`; also covers rejected/suspended) · home: online/offline toggle (sends current position;
`not_at_depot` names the nearest depot and distance; depots listed with distances and shown on a map with geofence
circles) · low-balance blocking banner (`wallet.blocked`, `wallet.updated`, `wallet_below_minimum`) with Top up ·
incoming job offers with countdown to `expiresAt`, earnings, load, distance, landmark notes, accept/decline
(`order_taken` → "already taken") · job screen: navigate to depot / customer (external maps app via
`google.navigation:` → `geo:` → Google Maps URL), "I am at the depot" (ACCEPTED→LOADING, geofence), "Water loaded"
(LOADING→EN_ROUTE, geofence), "I have arrived", "Mark delivered" with optional proof photo, cash-to-collect reminder,
call customer · report issue · wallet: balance / minimum / withdrawable / pending top-ups and the ledger
(`GET /driver/wallet/entries`, paged) · top-up: bank transfer (amount + reference + optional receipt photo) or cell money
(amount + number → payment instructions) · withdrawal request · earnings (today / 7 days / 30 days) · job history · profile.

## Location sharing

`LocationTrackingService` is a foreground service (persistent notification) that runs exactly while the server says the
driver is online. It listens to GPS + network providers (min 15 s / 20 m), buffers fixes and sends them as one batch every
`config.locationIntervalSec` (clamped to 15–30 s, default 20) to `POST /driver/location`. With no new fix it sends the last
one as a heartbeat so dispatch keeps the driver eligible (last seen < 2 min). Failed batches stay buffered (max 100 points).
If the server answers `online:false` the app flips to offline and stops the service.

## Unreliable network

- Accept, top-up and withdrawal go through the core `IdempotentRequestQueue`: one UUID `Idempotency-Key` per tap, persisted
  with the exact body, reused for every retry (backoff, the retry button, or the drain on reconnect). Accept actions expire
  with the offer, so a stale accept is never replayed later. Pending top-ups/withdrawals are restored (form locked) on reopen.
- Profile, config, depots, wallet, earnings and the active job are cached so screens render offline.
- Socket.IO connects while the app is visible **or** the driver is online (offers are time-critical); offers are also polled
  every 30 s while online, and FCM push is the backup channel. A socket offer arriving while backgrounded raises a heads-up notification.

## Tests

`app/src/test`: `HomeViewModelTest` (accept retried with the same key and opens the job; losing the race shows
"already taken" and removes the offer; `not_at_depot` names the nearest depot; `wallet_below_minimum` blocks with the
shortfall) and `DriverLogicTest` (status → stage / job-step mapping, DriverState reacting to socket events incl. expired
offer pruning and partial cancel payloads, top-up Kina validation, bank top-up retried with the same key and body).
