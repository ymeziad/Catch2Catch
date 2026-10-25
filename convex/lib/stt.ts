/**
 * Speech-to-text behind one interface: transcribe(audio, role) -> segments.
 *
 * Default provider: xAI Grok (`POST https://api.x.ai/v1/stt`, model `grok-voice-transcribe-2.0`).
 * Verified against https://docs.x.ai/developers/model-capabilities/audio/speech-to-text on 2026-10-24:
 *   - multipart/form-data, Bearer auth, `file` field must come AFTER all other fields
 *   - language is auto-detected when `language` is omitted (buyers may speak Spanish / mix)
 *   - response has word-level `words[{text,start,end}]` (seconds); no segment timestamps,
 *     so we group words into segments ourselves.
 *
 * Fallback provider (timebox rule): OpenAI Whisper, selected with STT_PROVIDER=openai.
 * Everything downstream depends only on `Segment`.
 */

export type Role = "buyer" | "seller";

export type Segment = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  /** Only set when diarization was used (mono recordings). */
  speaker?: number;
};

type Word = { text: string; start: number; end: number; speaker?: number; confidence?: number };

const KEYTERMS = ["Coca-Cola", "Coke", "Dr Pepper", "horchata", "Celsius", "cases", "case", "pack", "delivery", "invoice"];

export type TranscribeOptions = { diarize?: boolean; language?: string };

// ---------------------------------------------------------------- long-audio chunking
//
// Sending a whole call channel (minutes long, 8 kHz phone audio) in one request makes the STT model
// skip short phrases: on a real call it dropped the seller's "Okay, that's fine" confirming a quantity
// change, which it transcribed perfectly when given just those seconds. So each channel is cut at
// pauses into pieces of at most MAX_CHUNK_S, transcribed separately, and the words are shifted back
// onto the call's timeline.

const FRAME_MS = 20;
const MIN_PAUSE_S = 0.6; // a silence at least this long is a safe place to cut
const MAX_CHUNK_S = 20;
const PAD_S = 0.3; // keep a little audio around each piece so word edges aren't clipped
const CHUNK_CONCURRENCY = 4;

type Pcm = { samples: Int16Array; sampleRate: number };

/** Read a mono 16-bit PCM WAV (as produced by splitWavChannels / buildMonoWav). */
function readMonoPcm(wav: Uint8Array): Pcm {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let off = 12, sampleRate = 8000, dataOff = -1, dataLen = 0;
  while (off + 8 <= wav.byteLength) {
    const id = String.fromCharCode(wav[off], wav[off + 1], wav[off + 2], wav[off + 3]);
    const size = dv.getUint32(off + 4, true);
    if (id === "fmt ") sampleRate = dv.getUint32(off + 12, true);
    if (id === "data") { dataOff = off + 8; dataLen = Math.min(size, wav.byteLength - off - 8); break; }
    off += 8 + size + (size % 2);
  }
  if (dataOff < 0) throw new Error("WAV has no data chunk");
  const n = Math.floor(dataLen / 2);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) samples[i] = dv.getInt16(dataOff + i * 2, true);
  return { samples, sampleRate };
}

function pcmToWav(samples: Int16Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + samples.byteLength, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, samples.byteLength, true);
  const bytes = new Uint8Array(samples.byteLength);
  for (let i = 0; i < samples.length; i++) { bytes[i * 2] = samples[i] & 0xff; bytes[i * 2 + 1] = (samples[i] >> 8) & 0xff; }
  return new Blob([header, bytes], { type: "audio/wav" });
}

/** Speech regions as [startSec, endSec], split at pauses and capped at MAX_CHUNK_S. */
export function speechChunks(pcm: Pcm): Array<[number, number]> {
  const frameLen = Math.max(1, Math.round((pcm.sampleRate * FRAME_MS) / 1000));
  const frames = Math.floor(pcm.samples.length / frameLen);
  if (frames === 0) return [];
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frameLen; i < (f + 1) * frameLen; i++) sum += pcm.samples[i] * pcm.samples[i];
    rms[f] = Math.sqrt(sum / frameLen);
  }
  // Threshold from the track's own levels: well above its noise floor, well below its speech.
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(frames * 0.2)];
  const loud = sorted[Math.floor(frames * 0.95)];
  const threshold = Math.max(floor * 3, loud * 0.05, 150);
  const voiced = Array.from(rms, (r) => r > threshold);

  const frameS = FRAME_MS / 1000;
  const minPause = Math.round(MIN_PAUSE_S / frameS);
  const regions: Array<[number, number]> = [];
  let start = -1, silent = 0;
  for (let f = 0; f < frames; f++) {
    if (voiced[f]) {
      if (start < 0) start = f;
      silent = 0;
    } else if (start >= 0 && ++silent >= minPause) {
      regions.push([start * frameS, (f - silent + 1) * frameS]);
      start = -1; silent = 0;
    }
  }
  if (start >= 0) regions.push([start * frameS, frames * frameS]);

  // Merge neighbouring regions into pieces up to MAX_CHUNK_S; a single longer region is split evenly.
  const chunks: Array<[number, number]> = [];
  for (const [a, b] of regions) {
    const last = chunks[chunks.length - 1];
    if (last && b - last[0] <= MAX_CHUNK_S) last[1] = b;
    else if (b - a <= MAX_CHUNK_S) chunks.push([a, b]);
    else for (let s = a; s < b; s += MAX_CHUNK_S) chunks.push([s, Math.min(b, s + MAX_CHUNK_S)]);
  }
  const total = pcm.samples.length / pcm.sampleRate;
  return chunks.map(([a, b]) => [Math.max(0, a - PAD_S), Math.min(total, b + PAD_S)]);
}

/**
 * Transcribe one call channel (mono WAV) piece by piece and return segments on the call's timeline.
 * Use this for channel-separated recordings; `transcribe` sends the whole file in one request.
 */
export async function transcribeChannel(monoWav: Uint8Array, role: Role, opts: TranscribeOptions = {}): Promise<Segment[]> {
  const pcm = readMonoPcm(monoWav);
  const chunks = speechChunks(pcm);
  const provider = (process.env.STT_PROVIDER ?? "xai").toLowerCase();
  const results: Word[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const k = next++;
      const [a, b] = chunks[k];
      const piece = pcm.samples.subarray(Math.floor(a * pcm.sampleRate), Math.ceil(b * pcm.sampleRate));
      const blob = pcmToWav(piece, pcm.sampleRate);
      const words = provider === "openai" ? await openaiWords(blob, opts) : await xaiWords(blob, opts);
      results[k] = words.map((w) => ({ ...w, start: w.start + a, end: w.end + a }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));
  const words = results.flat().sort((x, y) => x.start - y.start);
  const segments = groupWords(words);
  console.log(`[stt] ${provider} ${role}: ${chunks.length} pieces, ${words.length} words -> ${segments.length} segments`);
  return segments;
}

export async function transcribe(audio: Blob, role: Role, opts: TranscribeOptions = {}): Promise<Segment[]> {
  const provider = (process.env.STT_PROVIDER ?? "xai").toLowerCase();
  const words = provider === "openai" ? await openaiWords(audio, opts) : await xaiWords(audio, opts);
  const segments = groupWords(words);
  console.log(`[stt] ${provider} ${role}: ${words.length} words -> ${segments.length} segments`);
  return segments;
}

// ---------------------------------------------------------------- xAI Grok

async function xaiWords(audio: Blob, opts: TranscribeOptions): Promise<Word[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");
  const model = process.env.XAI_STT_MODEL ?? "grok-voice-transcribe-2.0";

  const form = new FormData();
  form.append("model", model);
  if (opts.language) form.append("language", opts.language);
  if (opts.diarize) form.append("diarize", "true");
  form.append("filler_words", "false");
  for (const term of KEYTERMS) form.append("keyterm", term);
  form.append("file", audio, "audio.wav"); // must be last

  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`xAI STT failed ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    text?: string;
    language?: string;
    duration?: number;
    words?: Array<{ text: string; start: number; end: number; speaker?: number }>;
  };
  const words = json.words ?? [];
  if (words.length === 0 && json.text && json.text.trim()) {
    // No word timing (should not happen per docs) — fall back to one segment spanning the audio.
    return [{ text: json.text.trim(), start: 0, end: json.duration ?? 0 }];
  }
  return words.map((w) => ({ text: w.text, start: w.start, end: w.end, speaker: w.speaker }));
}

// ---------------------------------------------------------------- OpenAI Whisper (fallback)

async function openaiWords(audio: Blob, opts: TranscribeOptions): Promise<Word[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (STT_PROVIDER=openai)");
  const form = new FormData();
  form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (opts.language) form.append("language", opts.language);
  form.append("file", audio, "audio.wav");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI STT failed ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    text?: string;
    duration?: number;
    words?: Array<{ word: string; start: number; end: number }>;
    segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number }>;
  };
  if (json.words && json.words.length) return json.words.map((w) => ({ text: w.word, start: w.start, end: w.end }));
  // Segments only: expand each segment into a single pseudo-word so grouping still works.
  return (json.segments ?? []).map((s) => ({
    text: s.text.trim(),
    start: s.start,
    end: s.end,
    confidence: s.avg_logprob !== undefined ? Math.exp(s.avg_logprob) : undefined,
  }));
}

// ---------------------------------------------------------------- grouping

const MAX_GAP_S = 1.2; // silence that ends a segment
const MAX_WORDS = 28;
const MAX_DUR_S = 15;

/** Group timed words into utterance-like segments. Speaker changes (if diarized) always split. */
export function groupWords(words: Word[]): Segment[] {
  const out: Segment[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(" ").replace(/\s+([.,!?])/g, "$1").trim();
    const confs = cur.map((w) => w.confidence).filter((c): c is number => typeof c === "number");
    out.push({
      startMs: Math.round(cur[0].start * 1000),
      endMs: Math.round(cur[cur.length - 1].end * 1000),
      text,
      confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : undefined,
      speaker: cur[0].speaker,
    });
    cur = [];
  };
  for (const w of words) {
    if (!w.text || !w.text.trim()) continue;
    const last = cur[cur.length - 1];
    if (last) {
      const gap = w.start - last.end;
      const dur = w.end - cur[0].start;
      const speakerChanged = w.speaker !== undefined && w.speaker !== last.speaker;
      if (gap > MAX_GAP_S || cur.length >= MAX_WORDS || dur > MAX_DUR_S || speakerChanged) flush();
    }
    cur.push(w);
  }
  flush();
  return out;
}
