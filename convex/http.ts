import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseForm, twiml, twilioCredsFromEnv, twilioDeleteRecording, validateTwilioSignature, xml, type TwilioParams } from "./lib/twilio";

/**
 * Twilio webhooks (Yosef). Simple two-party call, no conference, no live audio streaming,
 * and no AI anywhere in the live call path.
 *
 * Call flow:
 *   buyer dials Twilio number
 *     -> POST /twilio/voice           consent prompt inside <Gather>; press 1
 *     -> POST /twilio/buyer-consent   digit 1: insert calls row (buyerConsent), <Dial record="record-from-answer-dual">
 *                                     to SELLER_PHONE with <Number url="/twilio/seller-screen">
 *     -> POST /twilio/seller-screen   (runs on the seller leg before bridging) consent prompt inside <Gather>
 *     -> POST /twilio/seller-consent  digit 1: sellerConsent = true, empty TwiML => bridge; else <Hangup/>
 *     -> POST /twilio/dial-done       after <Dial> ends: explain to the buyer if the seller declined / didn't answer
 *     -> POST /twilio/recording       RecordingStatus=completed: if both consented, schedule recordings.ingest;
 *                                     otherwise DELETE the recording at Twilio so nothing is kept.
 *   SMS: POST /twilio/sms             insert messages row, schedule messaging.routeInbound
 *        POST /twilio/sms-status      carrier delivery updates for outbound texts
 *
 * Twilio dual-channel: channel 1 = inbound caller (buyer), channel 2 = dialed party (seller).
 */

const http = httpRouter();

const CONSENT_SCRIPT =
  "This call will be recorded and analyzed to document your order. After the call, both of you will receive a text summary. Press 1 to agree to recording.";

function baseUrl(request: Request): string {
  const override = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function consentPrompt(): string {
  const url = process.env.CONSENT_AUDIO_URL;
  return url ? `<Play>${xml.escape(url)}</Play>` : `<Say>${xml.escape(CONSENT_SCRIPT)}</Say>`;
}

function say(text: string): string {
  return `<Say>${xml.escape(text)}</Say>`;
}

/** Parse the form body and validate X-Twilio-Signature. Returns params or a 403 Response. */
async function guard(request: Request): Promise<{ params: TwilioParams } | { reject: Response }> {
  const params = await parseForm(request);
  const ok = await validateTwilioSignature(request, params, {
    authToken: process.env.TWILIO_AUTH_TOKEN,
    baseUrlOverride: process.env.TWILIO_WEBHOOK_BASE_URL,
    skip: process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === "1",
  });
  if (!ok) {
    console.warn(`[twilio] rejected request to ${new URL(request.url).pathname}: bad or missing signature`);
    return { reject: new Response("Invalid Twilio signature", { status: 403 }) };
  }
  return { params };
}

// --------------------------------------------------------------------------- voice

http.route({
  path: "/twilio/voice",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const base = baseUrl(request);
    return twiml(
      `<Gather numDigits="1" action="${base}/twilio/buyer-consent" method="POST" timeout="8">${consentPrompt()}</Gather>` +
        say("We did not receive a response, so this call was not recorded. Goodbye.") +
        `<Hangup/>`,
    );
  }),
});

http.route({
  path: "/twilio/buyer-consent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    const base = baseUrl(request);
    const callSid = params.CallSid ?? "";

    if (params.Digits !== "1") {
      await ctx.runMutation(internal.audit.log, {
        actor: "shop", action: "buyer_declined_consent", entityType: "twilioCall", entityId: callSid,
        reason: `Caller did not press 1 (digits="${params.Digits ?? ""}"); call not connected, nothing recorded`,
      });
      return twiml(say("No problem. This call will not be recorded or connected. Goodbye.") + `<Hangup/>`);
    }

    const sellerPhone = process.env.SELLER_PHONE;
    if (!sellerPhone) {
      console.error("[twilio] SELLER_PHONE is not set");
      return twiml(say("The distributor line is not configured yet. Please try again later.") + `<Hangup/>`);
    }

    const callId = await ctx.runMutation(internal.calls.create, {
      twilioCallSid: callSid,
      buyerPhone: params.From ?? "",
      sellerPhone,
    });
    await ctx.runMutation(internal.audit.log, {
      actor: "shop", action: "buyer_consented", entityType: "call", entityId: callId,
      reason: "Buyer pressed 1 to agree to recording; dialing distributor",
      evidenceRefs: [{ type: "twilioCall", id: callSid }],
    });

    const screen = `${base}/twilio/seller-screen?parent=${encodeURIComponent(callSid)}`;
    const done = `${base}/twilio/dial-done?parent=${encodeURIComponent(callSid)}`;
    return twiml(
      say("Thank you. Connecting you now.") +
        `<Dial record="record-from-answer-dual" recordingStatusCallback="${base}/twilio/recording" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST" action="${done}" method="POST" timeout="30">` +
        `<Number url="${xml.escape(screen)}" method="POST">${xml.escape(sellerPhone)}</Number>` +
        `</Dial>`,
    );
  }),
});

http.route({
  path: "/twilio/seller-screen",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const base = baseUrl(request);
    const parent = new URL(request.url).searchParams.get("parent") ?? "";
    const action = `${base}/twilio/seller-consent?parent=${encodeURIComponent(parent)}`;
    // Runs on the seller's leg before the two parties are bridged. No digit => hang up the seller leg.
    return twiml(`<Gather numDigits="1" action="${xml.escape(action)}" method="POST" timeout="8">${consentPrompt()}</Gather><Hangup/>`);
  }),
});

http.route({
  path: "/twilio/seller-consent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    const parent = new URL(request.url).searchParams.get("parent") ?? "";
    if (params.Digits === "1") {
      const callId = await ctx.runMutation(internal.calls.setSellerConsent, { twilioCallSid: parent });
      await ctx.runMutation(internal.audit.log, {
        actor: "owner", action: "seller_consented", entityType: "call", entityId: callId ?? parent,
        reason: "Distributor pressed 1 to agree to recording; bridging the call",
      });
      return twiml(""); // empty <Response/> => connect the two parties
    }
    await ctx.runMutation(internal.audit.log, {
      actor: "owner", action: "seller_declined_consent", entityType: "twilioCall", entityId: parent,
      reason: `Distributor did not press 1 (digits="${params.Digits ?? ""}"); call not bridged`,
    });
    return twiml(say("Understood. The call will not be connected. Goodbye.") + `<Hangup/>`);
  }),
});

http.route({
  path: "/twilio/dial-done",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    const parent = new URL(request.url).searchParams.get("parent") ?? params.CallSid ?? "";
    const call = await ctx.runQuery(internal.calls.getBySid, { twilioCallSid: parent });
    const dialStatus = params.DialCallStatus ?? "";

    if (call && !call.sellerConsent) {
      if (call.status === "in_progress") {
        await ctx.runMutation(internal.calls.setStatus, { callId: call._id, status: "failed", error: `seller did not consent (dial status: ${dialStatus})`, endedAt: Date.now() });
      }
      const why = dialStatus === "completed" ? "The distributor did not agree to recording" : "We could not reach the distributor";
      return twiml(say(`${why}, so this call was not recorded. Please try again later. Goodbye.`) + `<Hangup/>`);
    }
    if (call && dialStatus && dialStatus !== "completed" && dialStatus !== "answered") {
      await ctx.runMutation(internal.calls.setStatus, { callId: call._id, status: "failed", error: `dial status: ${dialStatus}`, endedAt: Date.now() });
      return twiml(say("We could not reach the distributor. Please try again later. Goodbye.") + `<Hangup/>`);
    }
    return twiml(`<Hangup/>`);
  }),
});

// --------------------------------------------------------------------------- recording

http.route({
  path: "/twilio/recording",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    if (params.RecordingStatus !== "completed") return new Response("", { status: 204 });

    const callSid = params.CallSid ?? "";
    const recordingSid = params.RecordingSid ?? "";
    const recordingUrl = params.RecordingUrl ?? "";
    const call = await ctx.runQuery(internal.calls.getBySid, { twilioCallSid: callSid });

    if (!call || !call.buyerConsent || !call.sellerConsent) {
      // Consent rule: if either party didn't press 1, nothing is kept.
      const creds = twilioCredsFromEnv();
      const deleted = creds && recordingSid ? await twilioDeleteRecording(creds, recordingSid) : false;
      await ctx.runMutation(internal.audit.log, {
        actor: "system", action: "recording_discarded_no_consent", entityType: call ? "call" : "twilioCall", entityId: call?._id ?? callSid,
        reason: `Recording ${recordingSid} ${deleted ? "deleted at Twilio" : "NOT deleted (delete failed or creds missing)"} because both parties did not consent`,
      });
      if (call && call.status === "in_progress") {
        await ctx.runMutation(internal.calls.setStatus, { callId: call._id, status: "failed", error: "recording discarded: seller consent missing", endedAt: Date.now() });
      }
      return new Response("", { status: 204 });
    }

    await ctx.scheduler.runAfter(0, internal.recordings.ingest, { callId: call._id, recordingSid, recordingUrl });
    return new Response("", { status: 204 });
  }),
});

// --------------------------------------------------------------------------- SMS

http.route({
  path: "/twilio/sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    const from = params.From ?? "";
    const body = params.Body ?? "";
    const messageId = await ctx.runMutation(internal.messaging.recordMessage, {
      direction: "in",
      to: params.To ?? process.env.TWILIO_NUMBER ?? "",
      from,
      body,
      twilioSid: params.MessageSid,
      status: "received",
    });
    await ctx.scheduler.runAfter(0, internal.messaging.routeInbound, { fromPhone: from, body, messageId });
    // Empty TwiML: replies (if any) go out through sendSms so they are logged in `messages`.
    return twiml("");
  }),
});

// Delivery updates for outbound texts (StatusCallback set by messaging.sendSms).
http.route({
  path: "/twilio/sms-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const g = await guard(request);
    if ("reject" in g) return g.reject;
    const { params } = g;
    if (params.MessageSid && params.MessageStatus) {
      await ctx.runMutation(internal.messaging.applyDeliveryStatus, {
        twilioSid: params.MessageSid,
        deliveryStatus: params.MessageStatus,
        errorCode: params.ErrorCode || undefined,
      });
    }
    return new Response("", { status: 204 });
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response("ok", { status: 200 })),
});

export default http;
