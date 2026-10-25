/** Short, stable key for a piece of text (FNV-1a + length), used to cache translations and voice clips. */
export function textKey(prefix: string, text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}:${h.toString(16)}:${text.length}`;
}
