/** Normalize a phone number to E.164 where we can. US-centric (hackathon demo). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return digits ? "+" + digits : "";
}

export function samePhone(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizePhone(a) === normalizePhone(b);
}
