# Catch2Catch

**An AI "order witness" and back office for small US wholesale drink distributors and the restaurants and corner shops they supply.** Built at Cal Hacks 13.0.

Orders between small distributors and small shops are agreed by phone, fast, and nobody writes them down. When the warehouse ships short or wrong, neither side has proof of what was agreed or what was packed. Catch2Catch records the call (with both parties' consent), transcribes each speaker separately, has Claude extract the order, gets both sides to confirm by text, checks the packing against the order, and keeps every piece of evidence for when a dispute comes in.

## How it works

1. A buyer calls the distributor's Twilio number. A consent message plays; the buyer presses 1. The distributor rep is dialed, hears the same message, presses 1. **Only then** are they connected and recorded, dual-channel (buyer and seller on separate tracks). No AI speaks on the call and nothing adds delay.
2. Call ends → recording → speech-to-text per channel (xAI Grok) → transcript segments with role (buyer/seller) and timestamps.
3. Claude analyzes the transcript: `verbal_agreement` | `no_agreement` | `needs_review`, order lines matched to catalog SKUs, negotiation history, open issues. It never invents a number.
4. Both parties get the identical SMS summary and reply **CONFIRM** or **DISPUTE**.
5. Both confirm → invoice + ledger entries; payment reminders start.
6. The warehouse packer scans each barcode and photographs the box. Mismatches block "ready to ship" until fixed or the owner overrides. Scans and photos are kept as evidence.
7. A short payment or a dispute text opens a dispute. Claude compares order, transcript, packing evidence, payment and shop history and recommends credit / refund / replacement / reject-with-evidence / escalate. **The owner approves; the agent never approves its own recommendation.**
8. Reminders run on a schedule, escalate to the owner, and stop when paid or disputed.
9. Apify pulls reference retail prices daily; agreed prices far from reference get flagged.
10. Every action goes to an audit log with a reason and evidence refs.

## Stack

- **Frontend:** Next.js 16 (App Router, TypeScript, Tailwind)
- **Backend:** Convex (database, file storage, HTTP actions for Twilio webhooks, scheduler/crons, actions for external APIs)
- **Telephony:** Twilio Voice + SMS
- **Speech-to-text:** xAI Grok (`grok-voice-transcribe-2.0`)
- **Order brain and dispute analysis:** Anthropic Claude (`claude-sonnet-5-5`)
- **Reference prices:** Apify
- One repo, one Convex deployment. All secrets live in Convex environment variables. Nothing secret is committed.

## Getting started

```bash
npm install
npx convex dev        # log in, create a dev deployment, writes .env.local, keeps functions synced
npm run dev           # Next.js on http://localhost:3000
```

Then set the Convex environment variables listed in [`.env.example`](.env.example) with `npx convex env set NAME value` (or in the Convex dashboard).

### Twilio setup (Person 1, first 30 minutes)

1. Get a Twilio number. On a **trial account** you can only call/text verified numbers: verify all three teammates' phones.
2. In the Twilio console, set the number's **Voice** webhook to `POST https://<deployment>.convex.site/twilio/voice` and its **Messaging** webhook to `POST https://<deployment>.convex.site/twilio/sms`. (The `.convex.site` host is where Convex serves HTTP actions; `npx convex dev` prints it.)
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`, `SELLER_PHONE`, `XAI_API_KEY`, and optionally `CONSENT_AUDIO_URL`.
4. If outbound texts don't arrive (A2P 10DLC carrier registration), don't fight it: `sendSms` records them as `simulated` and the dashboard still shows them.

## Repo layout

```
app/                     Next.js pages: /, /calls, /calls/[id], /messages, /admin/upload
components/              Convex client provider
convex/
  schema.ts              shared schema (all money in integer cents)
  http.ts                Twilio webhooks: voice consent flow, recording callback, inbound SMS
  calls.ts               calls table: consent state, status transitions, dashboard queries
  recordings.ts          download dual-channel WAV from Twilio -> Convex storage
  transcription.ts       split channels -> Grok STT -> transcriptSegments -> orders.analyzeCall
  messaging.ts           internal.messaging.sendSms + inbound SMS router (CONFIRM / DISPUTE)
  admin.ts               demo safety net: run the pipeline on an uploaded recording; test SMS
  audit.ts               internal.audit.log (Person 3) - working minimal version
  orders.ts              analyzeCall / confirmOrder (Person 2) - STUBS with agreed signatures
  disputes.ts            openFromSms (Person 3) - STUB
  billing.ts             createInvoiceForOrder (Person 3) - STUB
  lib/twilio.ts          signature validation, TwiML, Twilio REST (SMS, recording download/delete)
  lib/stt.ts             transcribe(audio, role) -> segments; xAI Grok, OpenAI Whisper fallback
  lib/wav.ts             PCM WAV parse + channel deinterleave
  lib/phone.ts           E.164 normalization
data/drink_catalog_seed.json   demo catalog (Coca-Cola, Dr Pepper, horchata, Celsius)
docs/team-prompts/       the three per-person build briefs
```

### Shared function contracts

| Function | Owner | Called by |
|---|---|---|
| `internal.messaging.sendSms({ to, body, relatedType?, relatedId? })` | Person 1 | everyone |
| `internal.orders.analyzeCall({ callId })` | Person 2 | Person 1 after transcript is saved |
| `internal.orders.confirmOrder({ orderId, party })` | Person 2 | Person 1 SMS router on CONFIRM |
| `internal.disputes.openFromSms({ fromPhone, body })` | Person 3 | Person 1 SMS router on DISPUTE / free text |
| `internal.billing.createInvoiceForOrder({ orderId })` | Person 3 | `confirmOrder` when both confirmed |
| `internal.audit.log({ actor, action, entityType, entityId, reason, evidenceRefs? })` | Person 3 | everyone |

Demo time: always use `now = Date.now() + settings.demoClockOffsetMs` for scheduling logic.

## Calls, transcription and messaging (Person 1) — design notes

**Consent.** The buyer hears the consent message inside a `<Gather>` and must press 1 before anything else happens; if they don't, we say goodbye and hang up and no `calls` row is created. The seller is dialed with `<Number url="/twilio/seller-screen">`, so the same message plays on *their* leg before the two are bridged; pressing 1 sets `sellerConsent` and returns empty TwiML (which bridges), anything else hangs up their leg. Because `<Dial record="record-from-answer-dual">` can start recording as soon as the seller answers, the recording callback checks both consent flags and **deletes the recording at Twilio** when either is missing, so a declined call leaves no audio behind. Every consent decision is written to the audit log.

**Role separation.** Recording is dual-channel: Twilio puts the inbound caller (buyer) on channel 1 and the dialed party (seller) on channel 2. We download the WAV with `RequestedChannels=2`, deinterleave the PCM into two mono tracks, and transcribe each one separately, so a segment's role comes from the physical channel, not from a speaker-identification guess. Background voices on the buyer's side land in the buyer channel and are visible as such to the analysis step.

**When transcription is uncertain.** Grok returns word-level timestamps; we group words into utterance segments and keep per-segment confidence when the provider gives one. If a recording is mono (e.g. an uploaded test file), we diarize instead and mark the call with a note that roles were inferred, not channel-separated. Any STT failure sets the call to `failed` with the error text and an audit entry, and nothing downstream runs. Downstream, Claude treats low confidence and conflicting numbers as `needs_review` rather than guessing.

**What is stored.** The dual-channel WAV (Convex file storage), transcript segments (role, start/end ms, text, confidence), the call's consent flags and Twilio SIDs, every SMS in and out (including ones Twilio could not deliver, marked `simulated`), and an audit-log entry for each step. No real customer names or numbers are in the repo; demo data is synthetic.

**Webhook security.** Every Twilio webhook validates `X-Twilio-Signature` (HMAC-SHA1 over the full URL plus sorted POST params, keyed by the auth token). Requests that fail validation get a 403.

**Demo safety net.** `/admin/upload` uploads a recording and runs Steps 3–4 on it, so the full pipeline can be shown even if the live call fails during judging.

## Sponsor tracks

- **Anthropic (Claude).** Claude turns a two-speaker transcript into a structured order with evidence pointers, flags uncertainty as `needs_review` instead of guessing, and later analyzes disputes against the full evidence set. It recommends; it never approves money movements.
- **Hyphenate (autonomous finance systems).** An autonomous accounts-receivable clerk: invoices, double-entry ledger, scheduled reminders with escalation, dispute recommendations with limits, and a complete decision record.
- **Microsoft (production-minded agent).** Consent before recording, signed webhooks, per-channel role separation, explicit failure states, audit log on every action, and an owner approval gate on money.
- **Apify.** Daily reference retail prices for the catalog feed the price-deviation flags on agreed orders.

## Team

- Person 1 — calls, transcription, messaging (Twilio, consent, recording, Grok STT, SMS in/out)
- Person 2 — order brain, catalog, packing check, Apify
- Amaan Singla — money, automation, dashboard
