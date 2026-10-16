# UAT checklist (Phase 1)

Run on staging with the mock providers (or manual cell money), two Android phones and the dashboard.

## Customer
- [ ] Register with phone + OTP; wrong code shows an error; 5 wrong codes lock the code
- [ ] Save a location with map pin and landmark notes; edit and delete it
- [ ] Choose package + quantity; price shown matches the price table
- [ ] Place COD order → "finding a driver"
- [ ] Place cell money order → pending screen with instructions/countdown → paid → finding a driver
- [ ] Cell money timeout → order shows failed, SMS received
- [ ] Cancel before acceptance works; after acceptance the app says to contact support
- [ ] Live tracking shows status timeline and driver on map from ACCEPTED to ARRIVED
- [ ] Confirm receipt; rate driver; raise a dispute; order history lists everything
- [ ] Airplane mode mid-order: app recovers, no duplicate order created on retry

## Driver
- [ ] Register, upload all documents and truck, see waiting-for-approval
- [ ] After approval, cannot go online with wallet < minimum (banner shows shortfall)
- [ ] Bank top-up submitted → approved in dashboard → balance updates
- [ ] Cannot go online away from a depot; can at the depot
- [ ] Offer arrives with countdown, distance and earnings; two drivers accept — only one wins
- [ ] At depot → loading; loaded → en route; arrived; delivered with photo
- [ ] Navigate opens the external maps app
- [ ] Commission deducted after completion (COD) / earnings credited (cell money)
- [ ] Withdrawal request above minimum works; larger amount refused
- [ ] Report issue raises a dispute

## Admin
- [ ] Login + TOTP; roles hide screens without permission
- [ ] Overview counts; live fleet map moves as drivers move
- [ ] Order search/filter/detail with timeline; cancel; reassign to driver; release to dispatch
- [ ] Document review, approve/reject/suspend driver
- [ ] Depot geofence editing (radius and polygon)
- [ ] Packages/pricing; settings changes take effect for new orders only
- [ ] Top-up queue, payments reconciliation (confirm manual payment), refunds, payouts
- [ ] Dispute resolution both ways (refund + clawback for cell money)
- [ ] Notification template edit rejects emoji and > 160 chars
- [ ] Audit log shows every admin action with before/after
- [ ] Reports + CSV exports open correctly in Excel

## Non-functional
- [ ] Load test p95 < 300 ms on core endpoints
- [ ] Error tracking receives a test exception (backend + both apps)
- [ ] Backup restore drill done
