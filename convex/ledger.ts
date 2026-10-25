import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * OWNER: Person 3. Double-entry ledger. The books must always balance.
 *
 *   Invoice issued         Dr accounts_receivable   Cr sales
 *   Payment received       Dr cash                  Cr accounts_receivable
 *   Credit note approved   Dr sales_returns         Cr accounts_receivable
 *   Cash refund approved   Dr sales_returns         Cr cash        (SIMULATED: no real money moves)
 *   Replacement approved   no ledger entry; audit log only (inventory is not tracked in this demo)
 *
 * Only code calls postEntryGroup, and only after an approval or a real event. The model never posts.
 */

export type Account = Doc<"ledgerEntries">["account"];
export type LedgerLine = { account: Account; debitCents: number; creditCents: number };

export async function postEntryGroup(
  ctx: MutationCtx,
  lines: LedgerLine[],
  refType: string,
  refId: string,
  memo: string,
  date: number,
): Promise<string> {
  if (lines.length < 2) throw new Error("Ledger: an entry group needs at least two lines");
  let debits = 0;
  let credits = 0;
  for (const l of lines) {
    for (const n of [l.debitCents, l.creditCents]) {
      if (!Number.isInteger(n) || n < 0) throw new Error(`Ledger: amounts must be non-negative integer cents (got ${n})`);
    }
    if (l.debitCents > 0 && l.creditCents > 0) throw new Error("Ledger: a line is either a debit or a credit");
    debits += l.debitCents;
    credits += l.creditCents;
  }
  if (debits !== credits) throw new Error(`Ledger: unbalanced entry (debits ${debits} != credits ${credits})`);
  if (debits === 0) throw new Error("Ledger: zero-amount entry");

  const entryGroupId = `${refType}:${refId}:${date}:${Math.random().toString(36).slice(2, 8)}`;
  for (const l of lines) {
    await ctx.db.insert("ledgerEntries", { entryGroupId, date, account: l.account, debitCents: l.debitCents, creditCents: l.creditCents, refType, refId, memo });
  }
  return entryGroupId;
}

/** Shorthand for the common two-line entry. */
export function pair(debit: Account, credit: Account, cents: number): LedgerLine[] {
  return [
    { account: debit, debitCents: cents, creditCents: 0 },
    { account: credit, debitCents: 0, creditCents: cents },
  ];
}

const ACCOUNTS: Account[] = ["cash", "accounts_receivable", "sales", "sales_returns"];

/** Trial balance: totals per account. Total debits must equal total credits. */
export const trialBalance = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ledgerEntries").collect();
    const byAccount = new Map<Account, { debitCents: number; creditCents: number }>();
    for (const a of ACCOUNTS) byAccount.set(a, { debitCents: 0, creditCents: 0 });
    let totalDebits = 0;
    let totalCredits = 0;
    for (const r of rows) {
      const t = byAccount.get(r.account)!;
      t.debitCents += r.debitCents;
      t.creditCents += r.creditCents;
      totalDebits += r.debitCents;
      totalCredits += r.creditCents;
    }
    return {
      accounts: ACCOUNTS.map((account) => {
        const t = byAccount.get(account)!;
        return { account, ...t, balanceCents: t.debitCents - t.creditCents };
      }),
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits,
      entryCount: rows.length,
    };
  },
});

/** Journal, newest first, grouped by entry group. */
export const journal = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("ledgerEntries").withIndex("by_date").order("desc").take((limit ?? 60) * 3);
    const groups = new Map<string, { entryGroupId: string; date: number; memo: string; refType: string; refId: string; lines: Doc<"ledgerEntries">[] }>();
    for (const r of rows) {
      let g = groups.get(r.entryGroupId);
      if (!g) {
        g = { entryGroupId: r.entryGroupId, date: r.date, memo: r.memo, refType: r.refType, refId: r.refId, lines: [] };
        groups.set(r.entryGroupId, g);
      }
      g.lines.push(r);
    }
    return [...groups.values()].slice(0, limit ?? 60);
  },
});
