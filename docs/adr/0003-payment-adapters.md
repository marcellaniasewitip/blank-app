# ADR 0003: Payment provider adapters and a single state-change path

**Status**: accepted

Cell money integrations implement `PaymentProvider`. The provider is chosen per payment at initiation
(setting `payment.cellmoney.adapter`) and stored on the row, so switching providers never strands in-flight
payments. Webhooks, polling, admin confirmation and timeouts all funnel into `PaymentsService.applyStatus`,
which locks the payment and only leaves an open state once. A success that arrives after expiry is still recorded
(money moved) and triggers a refund if the order has closed.
