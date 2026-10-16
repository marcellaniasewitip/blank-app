# Load test

`core-endpoints.js` (k6) ramps to 50 customer + 30 driver virtual users and fails if p95 latency on core endpoints
exceeds 300 ms or more than 1 % of requests fail. Run against **staging** with mock providers. Each driver VU posts
a location every 2 s — far above the real 15–30 s cadence — so it is a conservative test.

Rate limiting is per account for authenticated calls (300 requests/min) and per IP for auth endpoints, so give
each VU its own token. Local baseline (single API instance, 40 customer + 30 driver VUs, 60 s): 0 % errors,
p95 47 ms on core endpoints.
