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
