# ADR 0001: Modular monolith API + worker, one image

**Status**: accepted

A single NestJS codebase runs as two ECS services from one image: `api` (HTTP + WebSockets) and `worker`
(BullMQ consumers + sweeper). Domain services share one Nest module because their dependency graph is small and
acyclic (ledger → settlement/refunds → transitions → dispatch/orders/payments). Splitting into services can come
later along the same seams. Cross-process realtime uses the Socket.IO Redis adapter (API) and emitter (worker).
