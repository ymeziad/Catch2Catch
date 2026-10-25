# MASTER PROMPT — Subhan: ORDER BRAIN, CATALOG, PACKING CHECK AND APIFY

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
7. Payment is recorded. A short payment or a dispute text opens a dispute. Claude compares order, transcript, packing scans/photos, payment and shop history, and recommends: credit, cash refund (simulated), replacement, reject with evidence, or escalate. The owner approves. The agent can never approve its own recommendation (except one narrow auto-approve rule owned by Amaan). Approved outcomes post ledger entries and text the shop.
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
- Yosef — Calls, transcription, messaging (Twilio, consent, recording, Grok STT, SMS in/out).
- Subhan — Order brain, catalog, packing check, Apify (Claude call analysis, catalog matching, price flags, packing page, call eval set).
- Amaan — Money, automation, dashboard (repo + Convex setup + schema in first 30 min, ledger, invoices, payments, reminders, disputes, approvals, audit log, owner dashboard, dispute test set).

### Shared schema (`convex/schema.ts`, created by Amaan; all money in integer cents)
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
- Yosef provides `internal.messaging.sendSms({ to, body, relatedType?, relatedId? })` → inserts a `messages` row and sends via Twilio; if sending fails or SMS is blocked, status = "simulated" so the dashboard still shows it.
- Yosef calls `internal.orders.analyzeCall({ callId })` (Subhan) once transcript segments are saved.
- Yosef's inbound SMS router calls:
  - `internal.orders.confirmOrder({ orderId, party: "buyer"|"seller" })` (Subhan) on CONFIRM.
  - `internal.disputes.openFromSms({ fromPhone, body })` (Amaan) on DISPUTE or any other free-text reply from a shop about an existing order/invoice.
- Subhan's `confirmOrder` calls `internal.billing.createInvoiceForOrder({ orderId })` (Amaan) when both parties confirmed.
- Amaan provides `internal.audit.log({ actor, action, entityType, entityId, reason, evidenceRefs? })`. Everyone logs every meaningful action.
- Demo time: always use `now = Date.now() + settings.demoClockOffsetMs` for scheduling logic.

### Team milestones (PT)
- 7:30 PM — repo, schema, stubs deployed (Amaan); everyone pulls.
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

## YOUR JOB (SUBHAN): ORDER BRAIN, CATALOG, PACKING CHECK AND APIFY

You own turning a transcript into a trustworthy order, the product catalog and prices, and the warehouse packing check that produces evidence.

### Step 1 — Catalog
- Import `drink_catalog_seed.json` into `catalogProducts` (convert dollars to cents; prices start empty).
- Buy one real unit of each demo drink at a nearby store (Coca-Cola can, Dr Pepper can, Celsius can, a horchata product). Scan each barcode with your packing page (Step 5) and save it as `barcode` on the matching SKU. This makes the packing demo real.
- Set a plausible `priceWholesaleCents` per case for each SKU (confirm with the team's wholesaler contacts if possible).

### Step 2 — Apify reference prices (Apify track: must do real work in the product)
- Node action `refreshReferencePrices()`: for each product, run an Apify Store Walmart product scraper actor via the Apify API (env var `APIFY_TOKEN`) using the product's `apify_search_query`. Pick the best-matching result (brand + size in title), compute a per-case reference (per-unit price × unitsPerCase when the listing is a single unit; use listing price when it is already a matching pack). Save `priceRetailRefCents`, `priceRefSource` (listing URL), `priceUpdatedAt`. Log to audit.
- Run it daily with a Convex cron, plus a "Refresh prices" button for the demo.
- Price flag rule (explicit, explainable): retail is not wholesale, so flag an agreed per-case price that is ABOVE the retail reference (overcharge risk) or BELOW 40% of it (likely mistake). Store flags in `orders.priceFlags` with a one-line note.
- If Apify actors are slow or blocked, cache the last good results and show "last updated" time. Never block order analysis on Apify.

### Step 3 — `internal.orders.analyzeCall({ callId })` (the core)
1. Load the call's `transcriptSegments`, sorted by time, and format as lines like `[buyer 01:23] text`.
2. Call Claude (`claude-sonnet-5-5`, env `ANTHROPIC_API_KEY`) with the catalog (sku, name, unitsPerCase, aliases) and the transcript. Force structured output with a tool/JSON schema containing:
   - `status`: verbal_agreement | no_agreement | needs_review
   - `lines`: [{ sku, description, qty, unit, unitPriceCents (or null), confidence 0–1, evidenceStartMs, evidenceRole }]
   - `events`: [{ field, value, proposedBy, acceptedBy|null, rejectedBy|null, atMs, quote (≤15 words from transcript) }]
   - `deliveryDate`, `paymentTerms` (null if not discussed)
   - `openIssues`: [string]
3. System prompt (use and refine):
   > You are a silent order witness for a phone call between a buyer (a restaurant or shop) and a seller (a wholesale distributor). You did not take part in the call. Extract only what was actually said. Rules: (1) A term is agreed only if one party proposed it and the other explicitly accepted it. (2) If a term changed, the latest mutually accepted value wins; record earlier proposals as events. (3) If a proposal was never accepted, it is not part of the order; list it in openIssues. (4) Never invent quantities, prices, dates or products. If a number is unclear, contradicted, or might come from a background voice, mark low confidence and add an open issue. (5) Match products to catalog SKUs using names and aliases, including Spanish and misspellings; if no confident match, use sku "UNKNOWN" and add an open issue. (6) Choose needs_review whenever you are not confident the outcome is clear.
4. Validate in code (do not trust the model blindly):
   - every sku exists in the catalog, else needs_review;
   - every quantity and price appears as a number or number word in the transcript, else needs_review;
   - any line with confidence < 0.7 → needs_review;
   - compute line totals and order total in code, never from the model.
5. Apply price flags (Step 2). Insert the `orders` row and `orderEvents`. Set the call status "done". Log to audit with evidence refs (segment timestamps).
6. Compose the SMS summary (identical text for both parties) and send to buyer and seller via `internal.messaging.sendSms`:
   - verbal_agreement: "Order #<id>. You verbally agreed: <lines with qty, item, price>. Total $<x>. Delivery <date or 'not discussed'>. Payment <terms or 'not discussed'>. Reply CONFIRM to accept or DISPUTE to correct."
   - no_agreement: "Order #<id>: No agreement was confirmed. Discussed: <items>. Buyer asked: <...>. Seller offered: <...>. Unresolved: <...>."
   - needs_review: "Order #<id>: We couldn't confirm all details from the call. Please check: <open issues>. Reply with corrections."
   Write it in the shop's `language` if not English, with the English version below it.

### Step 4 — `internal.orders.confirmOrder({ orderId, party })`
- Set buyerConfirmedAt or sellerConfirmedAt. When both are set and status is verbal_agreement → status "confirmed" → call `internal.billing.createInvoiceForOrder({ orderId })`. Log to audit.
- Allow manual confirm from the dashboard for demo safety.

### Step 5 — Packing check page (`/pack/[orderId]`, mobile-first)
- Show expected lines (item, qty). Camera barcode scanning in the browser (e.g. `html5-qrcode` or `@zxing/browser`). Each scan maps barcode → SKU and increments scanned qty; allow +/− correction.
- Photo capture: `<input type="file" accept="image/*" capture="environment">`, upload to Convex storage; require at least one photo.
- "Submit check": compare scanned vs expected per SKU → `packingChecks` row with result "match" or "mismatch" and the mismatch list. Mismatch shows a clear red screen ("Missing 2 × Dr Pepper 12 oz case") and blocks "ready to ship".
- Owner override requires a reason; store overrideBy/overrideReason; result "override". Log everything to audit with actor "packer" or "owner".

### Step 6 — Call eval set (proof for judges)
- Write 10 scripted call transcripts (as transcript segments) with an answer key, including: clean agreement; price negotiated down ($3.50 → $3.20 accepted); quantity changed mid-call; seller counteroffer never accepted (no agreement); background voice saying a different number; Spanish and mixed-language orders; unknown product; Yosef's 3 real recorded calls.
- Script that runs `analyzeCall` logic on each and scores: status correct, SKU correct, quantity correct, price correct. Output a results table (markdown) for Devpost: "Critical fields correct: X/Y; false agreements: Z".

### Done means
- A transcript produces a correct order row, events, open issues and price flags, and both parties get the same SMS.
- Unclear calls land in needs_review instead of guessing.
- Packing page scans real cans, stores photos, and flags a short pack.
- Apify prices refresh on a schedule and a price flag can be shown live.
- Eval results table exists.

### Do not
- Do not let Claude compute totals or decide anything about money.
- Do not mark anything confirmed without both parties' confirmation (or the manual demo button).
- Do not quote more than a short phrase of transcript into SMS.

### For the README (Anthropic and Apify tracks)
Explain where Claude is used, where it can go wrong (noisy calls, ambiguous numbers, background voices) and how code checks and needs_review protect users. Explain exactly what Apify does in the running product and how often.

