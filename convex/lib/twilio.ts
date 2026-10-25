/**
 * Twilio helpers that run in the Convex runtime (no Node SDK needed).
 * - request signature validation (X-Twilio-Signature)
 * - TwiML building
 * - REST calls: send SMS, download / delete recordings
 */

export type TwilioParams = Record<string, string>;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a <Response> document from inner TwiML. */
export function twiml(inner: string): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export const xml = { escape: escapeXml };

/** Parse application/x-www-form-urlencoded body into a plain object. */
export async function parseForm(request: Request): Promise<TwilioParams> {
  const text = await request.text();
  const params: TwilioParams = {};
  for (const [k, v] of new URLSearchParams(text)) params[k] = v;
  return params;
}

/**
 * Validate X-Twilio-Signature.
 * Algorithm (Twilio docs, "Webhooks security"): take the full URL Twilio requested
 * (including query string), append each POST param as key+value sorted by key,
 * HMAC-SHA1 with the auth token, base64 encode, compare to the header.
 */
export async function validateTwilioSignature(
  request: Request,
  params: TwilioParams,
  opts: { authToken: string | undefined; baseUrlOverride?: string; skip?: boolean },
): Promise<boolean> {
  if (opts.skip) return true;
  if (!opts.authToken) return false;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!signature) return false;

  const candidates = candidateUrls(request, opts.baseUrlOverride);
  const sortedKeys = Object.keys(params).sort();
  const suffix = sortedKeys.map((k) => k + params[k]).join("");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(opts.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  for (const url of candidates) {
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + suffix));
    const expected = base64(new Uint8Array(mac));
    if (timingSafeEqual(expected, signature)) return true;
  }
  return false;
}

/** Twilio signs the URL it was configured with; behind proxies the scheme/port can differ, so try a few spellings. */
function candidateUrls(request: Request, baseUrlOverride?: string): string[] {
  const u = new URL(request.url);
  const pathAndQuery = u.pathname + u.search;
  const out = new Set<string>();
  out.add(request.url);
  out.add(`https://${u.host}${pathAndQuery}`);
  out.add(`https://${u.hostname}${pathAndQuery}`);
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) out.add(`https://${fwdHost}${pathAndQuery}`);
  if (baseUrlOverride) out.add(baseUrlOverride.replace(/\/$/, "") + pathAndQuery);
  return [...out];
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function basicAuthHeader(accountSid: string, authToken: string): string {
  return "Basic " + btoa(`${accountSid}:${authToken}`);
}

export type TwilioCreds = { accountSid: string; authToken: string; fromNumber: string };

export function twilioCredsFromEnv(): TwilioCreds | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

/** Send an SMS through the Twilio REST API. Throws on non-2xx. */
export async function twilioSendSms(
  creds: TwilioCreds,
  to: string,
  body: string,
  statusCallback?: string,
): Promise<{ sid: string; status: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: creds.fromNumber, Body: body });
  // Twilio POSTs each delivery update (sent, delivered, undelivered, failed) here.
  if (statusCallback) form.set("StatusCallback", statusCallback);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(creds.accountSid, creds.authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) {
    throw new Error(`Twilio SMS failed (${res.status} ${json.code ?? ""}): ${json.message ?? "unknown"}`);
  }
  return { sid: json.sid ?? "", status: json.status ?? "queued" };
}

/** Download a Twilio recording as WAV (dual-channel recordings come back as stereo). */
export async function twilioDownloadRecordingWav(
  creds: TwilioCreds,
  recordingUrl: string,
): Promise<Blob> {
  const url = recordingUrl.endsWith(".wav") || recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.wav`;
  // Dual-channel WAVs need RequestedChannels=2, otherwise Twilio downmixes to mono.
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}RequestedChannels=2`, {
    headers: { Authorization: basicAuthHeader(creds.accountSid, creds.authToken) },
  });
  if (!res.ok) throw new Error(`Recording download failed: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "audio/wav" });
}

/** Permanently delete a recording at Twilio (used when consent was not given by both parties). */
export async function twilioDeleteRecording(creds: TwilioCreds, recordingSid: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Recordings/${recordingSid}.json`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: basicAuthHeader(creds.accountSid, creds.authToken) },
  });
  return res.ok || res.status === 404;
}
