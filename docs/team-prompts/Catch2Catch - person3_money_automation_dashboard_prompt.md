# MASTER PROMPT — PERSON 3: MONEY, AUTOMATION AND DASHBOARD

You are a senior engineer on a 3-person hackathon team. Read this whole document before writing code. It contains everything you need; assume no other context.

---

## SHARED CONTEXT (identical in all three team prompts)

### The product
`<APP_NAME>` is an AI "order witness" and back office for small US wholesale drink distributors and the restaurants and corner shops they supply.

### The problem we validated with real wholesalers
- Orders are agreed by phone, fast. Nobody has time to write everything down.
- The warehouse sometimes ships short or wrong. Neither side has proof of what was agreed or what was packed.
- Disputes cost money and trust. Small shops and small distributors cannot absorb even small losses; a missing order can mean a shop can't serve its own customers.

### Hackathon facts
- Event: Cal Hacks 13.0. Submission deadline: Sunday Oct 25, 2026, 9:00 AM PT on Devpost. Live demo judging 10:30 AM. Judges may ask us to run their own scenario live.
- Target tracks: Hyphenate (autonomous finance systems), Microsoft (production-minded agent), Anthropic (Claude, named community), Apify (meaningful Apify use).

### End-to-end flow
1. A buyer (restaurant/shop) calls the distributor's Twilio number. A prerecorded consent message plays. Buyer presses 1. The distributor rep is dialed, hears the same message, presses 1. Only then are they connected and recorded. Recording is dual-channel: buyer and seller on separate channels. The AI never speaks and adds no delay to the conversation.
2. Call ends → recording → speech-to-text per channel (xAI Grok) → transcript segments with role (buyer/seller) and timestamps.
3. Claude analyzes the transcript: status `verbal_agreement` | `no_agreement` | `needs_review`, order lines matched to catalog SKUs, negotiation history, open issues. It never invents a number.
4. Both parties get the identical SMS summary and reply CONFIRM or DISPUTE.
5. When both confirm → invoice + ledger entries, payment reminder schedule starts.
6. Warehouse packer opens a packing page on their phone, scans each item's barcode, photographs the box. System compares to the order. Mismatch blocks "ready to ship" until fixed or the owner overrides. Scans and photos are stored as evidence.
7. Payment is recorded. A short payment or a dispute text opens a dispute. Claude compares order, transcript, packing scans/photos, payment and shop history, and recommends: credit, cash refund (simulated), replacement, reject with evidence, or escalate. The owner approves. The agent can never approve its own recommendation (except one narrow auto-approve rule owned by Person 3). Approved outcomes post ledger entries and text the shop.
8. Reminders run automatically on a schedule, escalate to the owner, and stop when paid or disputed.
9. Apify pulls reference retail prices daily for the catalog; agreed prices far from reference get flagged.
10. Every action is written to an audit log with reason and evidence.

Demo catalog: Coca-Cola, Dr Pepper, horchata, Celsius (seed file `drink_catalog_seed.json`).

### Stack (whole team uses this; if you change it, change it in all three prompts)
- Frontend: Next.js (App Router, TypeScript).
- Backend: Convex (database, file storage, HTTP actions for Twilio webhooks, scheduled functions and crons, Node actions for external APIs).
- Twilio Voice + SMS. xAI Grok speech-to-text. Anthropic Claude API, model `claude-sonnet-5-5`. Apify API.
- One repo, one Convex deployment. All secrets in Convex environment variables. Never commit keys.

### Team ownership
- Person 1 — Calls, transcription, messaging (Twilio, consent, recording, Grok STT, SMS in/out).
- Person 2 — Order brain, catalog, packing check, Apify (Claude call analysis, catalog matching, price flags, packing page, call eval set).
- Person 3 — Money, automation, dashboard (repo + Convex setup + schema in first 30 min, ledger, invoices, payments, reminders, disputes, approvals, audit log, owner dashboard, dispute test set).

### Shared schema (`convex/schema.ts`, created by Person 3; all money in integer cents)
- `shops`: name, phone, contactName, language ("en"|"es"|other), paymentTermsDays, autoApproveLimitCents
- `calls`: twilioCallSid, buyerPhone, sellerPhone, shopId?, buyerConsent (bool), sellerConsent (bool), recordingSid?, recordingFileId? (storage id), status ("in_progress"|"recorded"|"transcribing"|"analyzing"|"done"|"failed"), error?, startedAt, endedAt?
- `transcriptSegments`: callId, role ("buyer"|"seller"), startMs, endMs, text, confidence?
- `catalogProducts`: sku, brand, name, unit, unitsPerCase, aliases (string[]), barcode?, priceWholesaleCents?, priceRetailRefCents?, priceRefSource?, priceUpdatedAt?
- `orders`: callId, shopId, status ("verbal_agreement"|"no_agreement"|"needs_review"|"confirmed"|"disputed"|"cancelled"), lines [{sku, description, qty, unit, unitPriceCents?, lineTotalCents?, confidence, evidenceStartMs?, evidenceRole?}], deliveryDate?, paymentTerms?, openIssues (string[]), priceFlags [{sku, agreedCents, refCents, note}], summaryText, buyerConfirmedAt?, sellerConfirmedAt?, totalCents?, createdAt
- `orderEvents`: orderId, field, value, proposedBy ("buyer"|"seller"), acceptedBy?, rejectedBy?, atMs, quote
- `packingChecks`: orderId, packerName, scans [{barcode, sku?, qty}], photoFileIds (storage ids), result ("match"|"mismatch"|"override"), mismatches [{sku, expectedQty, scannedQty}], overrideBy?, overrideReason?, checkedAt
- `invoices`: orderId, shopId, amountCents, balanceCents, issuedAt, dueAt, status ("open"|"partially_paid"|"paid"|"disputed"|"credited")
- `payments`: invoiceId, amountCents, method, receivedAt, note?
- `disputes`: invoiceId, orderId, shopId, shopMessage, claimedItems [{sku, qty, reason}], recommendation ("credit"|"cash_refund"|"replacement"|"reject_with_evidence"|"escalate"), reasoning, evidenceRefs [{type, id, detail}], amountCents, status ("open"|"awaiting_approval"|"approved"|"rejected"|"resolved"), requestedBy, decidedBy?, decidedAt?
- `ledgerEntries`: entryGroupId, date, account ("accounts_receivable"|"sales"|"cash"|"sales_returns"), debitCents, creditCents, refType, refId, memo
- `reminders`: kind ("order_unconfirmed"|"payment_due_soon"|"payment_due"|"payment_late"|"escalate_owner"), invoiceId?, orderId?, scheduledFor, sentAt?, status ("scheduled"|"sent"|"cancelled"), messageId?
- `messages`: direction ("out"|"in"), to, from, body, relatedType?, relatedId?, twilioSid?, status ("sent"|"simulated"|"failed"|"received"), createdAt
- `auditLog`: actor ("agent"|"owner"|"packer"|"system"|"shop"), action, entityType, entityId, reason, evidenceRefs?, at
- `settings`: demoClockOffsetMs, ownerPhone

### Shared function contracts (if a teammate's function doesn't exist yet, write a stub with the same name and arguments that logs and returns)
- Person 1 provides `internal.messaging.sendSms({ to, body, relatedType?, relatedId? })` → inserts a `messages` row and sends via Twilio; if sending fails or SMS is blocked, status = "simulated" so the dashboard still shows it.
- Person 1 calls `internal.orders.analyzeCall({ callId })` (Person 2) once transcript segments are saved.
- Person 1's inbound SMS router calls:
  - `internal.orders.confirmOrder({ orderId, party: "buyer"|"seller" })` (Person 2) on CONFIRM.
  - `internal.disputes.openFromSms({ fromPhone, body })` (Person 3) on DISPUTE or any other free-text reply from a shop about an existing order/invoice.
- Person 2's `confirmOrder` calls `internal.billing.createInvoiceForOrder({ orderId })` (Person 3) when both parties confirmed.
- Person 3 provides `internal.audit.log({ actor, action, entityType, entityId, reason, evidenceRefs? })`. Everyone logs every meaningful action.
- Demo time: always use `now = Date.now() + settings.demoClockOffsetMs` for scheduling logic.

### Team milestones (PT)
- 7:30 PM — repo, schema, stubs deployed (Person 3); everyone pulls.
- 10:00 PM — each person's part works on its own.
- 12:00 AM — full flow works end to end (fake data is fine).
- 3:00 AM — real data in, test sets scored.
- 6:00 AM — feature freeze. Bugs only.
- 7:00 AM — demo video recorded. 9:00 AM — submitted.

### Team rules
- No real customer names or phone numbers in the repo. Use synthetic or anonymized data.
- Consent before recording. If either party doesn't press 1, nothing is recorded.
- The agent never approves money movements. "needs_review" beats a guess.
- No secrets in git. README has a section per track explaining how that sponsor's tool is used.

---

## YOUR JOB (PERSON 3): MONEY, AUTOMATION AND DASHBOARD

You own the repo setup, everything about money (invoices, payments, ledger, refunds, disputes, approvals), the automatic reminders, the audit log and the owner dashboard. This is the core of the Hyphenate track: an autonomous accounts-receivable clerk with limits, memory over time, and a full record of its decisions.

### Step 0 — Setup (first 30 minutes, everyone is waiting on this)
- Create the Next.js + Convex repo, deploy Convex, write `convex/schema.ts` exactly as above.
- Create stubs for every shared function (`messaging.sendSms`, `orders.analyzeCall`, `orders.confirmOrder`, `billing.createInvoiceForOrder`, `disputes.openFromSms`, `audit.log`) with the contract arguments.
- Seed 3 fake shops (one English, one Spanish, one with a history of late payments and past disputes) and a `settings` row (demoClockOffsetMs = 0, ownerPhone from env `OWNER_PHONE`).
- Share the repo and the list of env vars with the team.

### Step 1 — Audit log
- `internal.audit.log` inserts into `auditLog`. Every money action, reminder, decision and override must call it with a plain-English reason and evidence refs.

### Step 2 — Ledger (double-entry, the books must always balance)
- `postEntryGroup(lines, refType, refId, memo)`: inserts all lines with one `entryGroupId`; throws if total debits ≠ total credits.
- Entries:
  - Invoice issued: Dr accounts_receivable / Cr sales (invoice amount).
  - Payment received: Dr cash / Cr accounts_receivable (payment amount).
  - Credit note approved: Dr sales_returns / Cr accounts_receivable.
  - Cash refund approved (simulated, no real money moves): Dr sales_returns / Cr cash.
  - Replacement approved: no revenue entry; log the replacement shipment in audit (inventory is not tracked in this demo; say so in the README).
- Trial balance query: totals per account; debits must equal credits. Show it on the dashboard.

### Step 3 — Invoices and payments
- `internal.billing.createInvoiceForOrder({ orderId })`: amount = order.totalCents, dueAt = now + shop.paymentTermsDays, post invoice entry, schedule payment reminders (Step 4), text the shop a short invoice summary via `sendSms`. Log.
- `recordPayment({ invoiceId, amountCents, method })` (dashboard button for the demo): insert payment, post entry, update balance and status (paid / partially_paid). Cancel future reminders when paid.
- Short payment (paid less than balance with no dispute open): the agent automatically texts the shop: "We received $380 of $420 for order #<id>. Was something missing or damaged? Reply with details." and opens a dispute in status "open" with requestedBy "agent". This is autonomous AR behavior.

### Step 4 — Automatic reminders (Convex cron every minute)
- The cron sends every reminder with `scheduledFor <= now` and status "scheduled" via `sendSms`, marks it sent, logs it.
- Schedule on invoice creation: payment_due_soon (dueAt − 2 days), payment_due (dueAt), payment_late (dueAt + 3 days), escalate_owner (dueAt + 7 days; texts OWNER_PHONE and flags the invoice on the dashboard).
- Order unconfirmed: when an order is verbal_agreement and not confirmed, remind after 2 hours and next morning 9 AM; then flag to owner.
- Memory over time: if a shop paid late 2+ times in the last 90 days (demo-clock time), skip payment_due_soon and escalate at dueAt + 3 days. Store the reason in the audit log ("Escalated early: 2 late payments in 90 days").
- Cancel all pending reminders for an invoice when it is paid or a dispute opens; resume when the dispute resolves with a balance remaining.
- Demo clock: dashboard buttons "+1 day" and "+7 days" increase `settings.demoClockOffsetMs`, so judges can watch a week of reminders happen in seconds.

### Step 5 — Disputes and refunds (the Hyphenate "moment")
- `internal.disputes.openFromSms({ fromPhone, body })` and the short-payment path both create/update a dispute, set invoice status "disputed", then run `analyzeDispute(disputeId)`.
- `analyzeDispute` gathers evidence: order lines and events, the transcript segments near each disputed line, packing check (scans, mismatches, photo ids), payments, and this shop's dispute and payment history.
- Call Claude (`claude-sonnet-5-5`) with structured output: `claimedItems`, `recommendation` (credit | cash_refund | replacement | reject_with_evidence | escalate), `amountCents`, `reasoning` (3–5 plain sentences), `evidenceRefs` [{type, id, detail}]. Prompt rules: trust the packing scan over a claim when the scan matched and a photo exists; trust a claim when the packing check shows a mismatch or no check exists; sources that disagree must be named; when unsure, escalate.
- Code enforces limits (never the model):
  - Default: status "awaiting_approval"; the owner decides.
  - Narrow auto-approve rule: amount ≤ shop.autoApproveLimitCents AND shop has 0 disputes in the last 90 days AND the packing check supports the shop's claim. Then status "approved", decidedBy "rule:auto_small_clean". Log the rule.
  - Segregation of duties: whoever requested (agent) can never be decidedBy; enforce in code.
- Owner UI: approve or reject with a note. On approve: post the ledger entry for credit or cash refund, update invoice balance/status, text the shop the outcome in plain words. On reject_with_evidence: text the shop what the evidence shows (e.g. "Packing scan at 2:14 PM shows 5 cases of Dr Pepper and a photo of the box").

### Step 6 — Owner dashboard (Next.js, live via Convex queries)
Pages: Orders (status, summary, transcript with evidence highlights, price flags) · Packing checks (photos, mismatches) · Invoices and payments (record payment button) · Disputes (recommendation, reasoning, evidence, approve/reject) · Ledger and trial balance · Reminders timeline with demo clock buttons · Messages (sent and simulated SMS) · Audit log (filterable).
Keep it clean and simple. One great dispute screen beats eight average pages.

### Step 7 — Dispute test set (proof for Hyphenate)
- 12 planted scenarios with an answer key: true short-ship (packing mismatch), false shortage claim (scan matched + photo), damaged goods claim, price disagreement, repeat claimer, amount over auto-approve limit, no packing check exists, ambiguous evidence, partial payment with no message, etc.
- Script runs them and reports: correct recommendation X/12, wrong approvals 0, trial balance balanced. Output a markdown table for Devpost and the demo.

### Done means
- Confirming an order creates an invoice and balanced ledger entries.
- Reminders fire on the demo clock, adapt to shop history, escalate, and stop on payment or dispute.
- A short payment triggers an automatic text and a dispute; the agent recommends with evidence; the owner approves; ledger and invoice update; the shop is texted.
- Trial balance always balances. Every action is in the audit log.
- Test set results table exists.

### Do not
- Do not let the model approve anything or post ledger entries directly; code does that after approval.
- Do not move real money. Refunds are simulated and labeled as such.
- Do not build features outside this list before midnight.

### For the README and pitch (Hyphenate and Microsoft)
One line on the seats it fills: "The accounts-receivable clerk who invoices, chases payments and resolves short-pay disputes for a small wholesale distributor." Then: what's real vs simulated, the limits and approval rules, and the test set score.
