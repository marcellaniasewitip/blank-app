# ADR 0002: Integer toea and an append-only ledger

**Status**: accepted

All amounts are `Int` toea. Every balance change is a `LedgerEntry` with a deterministic idempotency key
(e.g. `commission:<order>:<driver>:<acceptedAt>`); the wallet's cached balance is updated in the same transaction
under `SELECT … FOR UPDATE`. A DB trigger rejects UPDATE/DELETE on `ledger_entries`. Corrections are new
`adjustment` entries. 32-bit `Int` caps a single balance at ~K21M, ample for Phase 1; widen to BigInt if the
platform wallet approaches it.
