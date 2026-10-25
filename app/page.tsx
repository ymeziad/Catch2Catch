import Link from "next/link";

const steps = [
  ["Buyer calls the Twilio number", "Consent prompt plays. Buyer presses 1."],
  ["Distributor is dialed", "Hears the same prompt, presses 1. Only then are they bridged and recorded (dual-channel)."],
  ["Call ends", "Recording stored → Grok speech-to-text per channel → transcript segments with buyer/seller roles."],
  ["Claude analyzes", "Order lines, status, open issues. Both parties get the identical SMS summary."],
  ["Reply CONFIRM or DISPUTE", "CONFIRM confirms the order; DISPUTE or free text opens a dispute for the owner."],
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Catch2Catch</h1>
        <p className="mt-2 text-zinc-600 max-w-2xl">
          An AI order witness for small drink distributors and the shops they supply. Phone orders are recorded
          with consent, transcribed per speaker, summarized, confirmed by text, and backed by evidence when
          something ships short.
        </p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {steps.map(([title, body], i) => (
          <div key={title} className="rounded-lg border bg-white p-4">
            <div className="text-xs font-mono text-zinc-500">step {i + 1}</div>
            <div className="font-medium">{title}</div>
            <div className="text-sm text-zinc-600 mt-1">{body}</div>
          </div>
        ))}
      </section>
      <section className="flex gap-3 text-sm">
        <Link href="/calls" className="rounded-md bg-zinc-900 text-white px-4 py-2">View calls</Link>
        <Link href="/admin/upload" className="rounded-md border px-4 py-2 bg-white">Run pipeline on an upload</Link>
      </section>
    </div>
  );
}
