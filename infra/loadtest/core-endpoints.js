// k6 load test for core endpoints (§12: API p95 < 300 ms).
//   k6 run -e BASE_URL=https://api.staging.example -e CUSTOMER_TOKENS=t1,t2,... -e DRIVER_TOKENS=t1,t2,... infra/loadtest/core-endpoints.js
// Use one token per simulated user (the API rate-limits per account): sign in test accounts by OTP on a
// staging environment with mock providers. VUs pick tokens round-robin.
// Read-heavy mix + order creation (COD) so the dispatch query (PostGIS) is exercised too.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const CUSTOMERS = (__ENV.CUSTOMER_TOKENS || '').split(',').filter(Boolean);
const DRIVERS = (__ENV.DRIVER_TOKENS || '').split(',').filter(Boolean);
const pick = (pool) => pool[(__VU - 1) % pool.length];

export const options = {
  scenarios: {
    customers: { executor: 'ramping-vus', exec: 'customer', startVUs: 0, stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 50 }, { duration: '30s', target: 0 }] },
    drivers: { executor: 'constant-vus', exec: 'driver', vus: 30, duration: '4m30s' },
  },
  thresholds: {
    'http_req_duration{kind:core}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const randomString = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const auth = (t) => ({ headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, tags: { kind: 'core' } });

let packageId;

export function customer() {
  const p = auth(pick(CUSTOMERS));
  if (!packageId) {
    const pk = http.get(`${BASE}/api/v1/customer/packages`, p);
    packageId = pk.json()[0]?.id;
  }
  check(http.get(`${BASE}/api/v1/customer/orders?limit=10`, p), { 'orders 200': (r) => r.status === 200 });
  check(http.post(`${BASE}/api/v1/customer/quote`, JSON.stringify({ packageId, quantity: 1 }), p), { 'quote 200': (r) => r.status === 200 });
  if (Math.random() < 0.1) {
    const body = JSON.stringify({ packageId, quantity: 1, paymentMethod: 'cod', location: { lat: -9.4438 + Math.random() * 0.02, lng: 147.1803 + Math.random() * 0.02, address: 'Load test', notes: '' } });
    const r = http.post(`${BASE}/api/v1/customer/orders`, body, { ...p, headers: { ...p.headers, 'Idempotency-Key': randomString(24) } });
    check(r, { 'create 201': (x) => x.status === 201 });
    if (r.status === 201) http.post(`${BASE}/api/v1/customer/orders/${r.json().order.id}/cancel`, JSON.stringify({ reason: 'load test' }), p);
  }
  sleep(1);
}

export function driver() {
  const p = auth(pick(DRIVERS));
  const pts = [{ lat: -9.4438 + Math.random() * 0.01, lng: 147.1803 + Math.random() * 0.01, at: new Date().toISOString() }];
  check(http.post(`${BASE}/api/v1/driver/location`, JSON.stringify({ points: pts }), p), { 'location 200': (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/driver/offers`, p), { 'offers 200': (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/driver/wallet`, p), { 'wallet 200': (r) => r.status === 200 });
  sleep(2);
}
