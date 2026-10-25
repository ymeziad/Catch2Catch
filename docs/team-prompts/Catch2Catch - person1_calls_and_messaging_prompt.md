# MASTER PROMPT — PERSON 1: CALLS, TRANSCRIPTION AND MESSAGING

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

## YOUR JOB (PERSON 1): CALLS, TRANSCRIPTION AND MESSAGING

You own everything between a phone ringing and clean transcript segments in the database, plus all SMS in and out.

### Step 0 — Twilio setup (first 30 min)
- Get a Twilio phone number (trial is fine). Trial accounts can only call and text numbers you have verified: verify all three teammates' phones now.
- Check whether SMS to US numbers is blocked by carrier registration (A2P 10DLC). If texts don't arrive, do not spend hours on it: `sendSms` marks messages "simulated" and the dashboard shows them. Tell the team.
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`, `SELLER_PHONE` (the distributor rep's phone for the demo), `XAI_API_KEY`, `CONSENT_AUDIO_URL`.

### Step 1 — Consent audio
- The team provides a prerecorded file. Host it (Convex file storage public URL or any public URL) and set `CONSENT_AUDIO_URL`.
- Script if they need one: "This call will be recorded and analyzed to document your order. After the call, both of you will receive a text summary. Press 1 to agree to recording."

### Step 2 — Voice webhooks (Convex HTTP actions)
Use a simple two-party call, not a conference. This avoids live audio streaming entirely.
- `POST /twilio/voice` (the number's incoming-call webhook): respond with TwiML that plays the consent audio inside a `<Gather numDigits="1" action="/twilio/buyer-consent">`. If no input, say a short goodbye and hang up.
- `POST /twilio/buyer-consent`: if digit is 1, insert a `calls` row (buyerConsent = true, status "in_progress") and respond with `<Dial>` to `SELLER_PHONE` that:
  - records dual-channel from answer (Twilio's `record="record-from-answer-dual"` on `<Dial>`),
  - sets `recordingStatusCallback` to `/twilio/recording`,
  - uses a `<Number url="/twilio/seller-screen">` so the seller hears consent before being connected.
  If not 1: polite message, hang up, nothing recorded.
- `POST /twilio/seller-screen`: play consent inside `<Gather>`; on 1 set sellerConsent = true and return empty TwiML (this bridges the call); otherwise `<Hangup/>`.
- Validate the Twilio request signature on every webhook.
- VERIFY in the Twilio docs: exact attribute names, and which recording channel is the caller vs. the dialed party. Then test with two real phones by having only one person talk.

### Step 3 — Recording to storage
- `POST /twilio/recording`: when status is "completed", download the recording (WAV) from Twilio using account credentials, store it in Convex file storage, set `recordingFileId`, status "recorded", endedAt. Log to audit.
- Split the stereo WAV into two mono tracks (buyer, seller). Twilio WAV is PCM, so deinterleaving in a Node action is straightforward; alternatively, if the STT API accepts multichannel audio with per-channel output, send it whole.

### Step 4 — Transcription (Grok)
- Set status "transcribing". Write one function `transcribe(audio, role)` that returns segments `{ startMs, endMs, text, confidence? }`. Everything else depends only on this interface.
- Implement it with xAI Grok speech-to-text. VERIFY the endpoint and model id in https://docs.x.ai/developers/model-capabilities/audio/speech-to-text (our notes say `grok-voice-transcribe-2.0`; confirm). Request timestamps. Allow automatic language detection (buyers may speak Spanish or mix languages).
- Timebox: if Grok isn't working within 45 minutes, switch the implementation behind the same interface to another STT provider and tell the team.
- Insert `transcriptSegments` with the correct role. Set status "analyzing" and call `internal.orders.analyzeCall({ callId })`. On any failure set status "failed" with the error and log it.

### Step 5 — Outbound SMS
- Implement `internal.messaging.sendSms` exactly as the contract says. Keep messages under ~600 characters. Log to audit.

### Step 6 — Inbound SMS router
- `POST /twilio/sms`: insert a `messages` row (direction "in").
- Find the sender's most recent open order or invoice by phone.
- Body starts with CONFIRM (case-insensitive, also accept "SI", "SÍ", "YES") → `internal.orders.confirmOrder({ orderId, party })` where party is buyer or seller based on which phone sent it.
- Body starts with DISPUTE, or any other free text from a shop → `internal.disputes.openFromSms({ fromPhone, body })`.
- Unknown sender → reply once: "We couldn't find an order for this number."

### Step 7 — Demo safety net
- Admin action `runPipelineOnUpload({ fileId, buyerPhone, sellerPhone })` that runs Steps 3–4 on an uploaded recording. If the live call fails during judging, we can still show the full pipeline.
- Record 3 test calls with teammates (clean agreement; no agreement; messy one with a background voice saying a different number). Give the transcripts and audio to Person 2 for the eval set.

### Done means
- A real call to the Twilio number plays consent to both sides, connects only after both press 1, and produces a dual-channel recording.
- Within ~1 minute of hang-up, `transcriptSegments` exist with correct buyer/seller roles, and `analyzeCall` is triggered.
- CONFIRM and DISPUTE replies route to the right functions. Every SMS appears in `messages` (sent or simulated).
- Declining consent records nothing.

### Do not
- Do not stream live audio or put any AI in the live call path.
- Do not build a talking AI assistant.
- Do not hardcode phone numbers or keys in code.

### For the README (Microsoft and Anthropic tracks)
Write a short section: how consent works, how roles are kept separate (dual-channel), what happens when transcription is uncertain, and what data is stored.
