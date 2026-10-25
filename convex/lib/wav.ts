/**
 * Minimal PCM WAV reader/writer. Twilio recordings are 16-bit PCM, 8 kHz,
 * mono or stereo (dual-channel). We only need to deinterleave channels.
 */

export type WavInfo = {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
  audioFormat: number;
};

export function parseWav(buf: ArrayBuffer): WavInfo {
  const dv = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a RIFF/WAVE file");
  let offset = 12;
  let fmt: Partial<WavInfo> = {};
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buf.byteLength) {
    const id = tag(offset);
    const size = dv.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        bitsPerSample: dv.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, buf.byteLength - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0 || fmt.channels === undefined) throw new Error("WAV missing fmt or data chunk");
  return {
    channels: fmt.channels!,
    sampleRate: fmt.sampleRate!,
    bitsPerSample: fmt.bitsPerSample!,
    audioFormat: fmt.audioFormat!,
    dataOffset,
    dataLength,
  };
}

/** Build a mono 16-bit PCM WAV from raw little-endian sample bytes. */
export function buildMonoWav(samples: Uint8Array, sampleRate: number, bitsPerSample: number): Uint8Array {
  const blockAlign = bitsPerSample / 8;
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF");
  dv.setUint32(4, 36 + samples.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  w(36, "data");
  dv.setUint32(40, samples.byteLength, true);
  const out = new Uint8Array(44 + samples.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(samples, 44);
  return out;
}

/**
 * Split an interleaved multi-channel PCM WAV into one mono WAV per channel.
 * Channel 0 = Twilio channel 1 (inbound caller = buyer), channel 1 = Twilio channel 2 (dialed party = seller).
 */
export function splitWavChannels(buf: ArrayBuffer): { info: WavInfo; channels: Uint8Array[] } {
  const info = parseWav(buf);
  if (info.audioFormat !== 1 && info.audioFormat !== 0xfffe) {
    throw new Error(`Unsupported WAV audio format ${info.audioFormat} (expected PCM)`);
  }
  const bytesPerSample = info.bitsPerSample / 8;
  const frame = bytesPerSample * info.channels;
  const frames = Math.floor(info.dataLength / frame);
  const src = new Uint8Array(buf, info.dataOffset, frames * frame);
  const outs: Uint8Array[] = [];
  for (let c = 0; c < info.channels; c++) {
    const mono = new Uint8Array(frames * bytesPerSample);
    for (let f = 0; f < frames; f++) {
      const s = f * frame + c * bytesPerSample;
      const d = f * bytesPerSample;
      for (let b = 0; b < bytesPerSample; b++) mono[d + b] = src[s + b];
    }
    outs.push(buildMonoWav(mono, info.sampleRate, info.bitsPerSample));
  }
  return { info, channels: outs };
}
