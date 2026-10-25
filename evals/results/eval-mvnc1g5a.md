# Call eval — 2026-10-25 04:35 UTC

Model `claude-sonnet-5-5` through the real `orders.analyzeCall` pipeline (Claude extraction + code checks), deployment `calm-trout-788`.

**Critical fields correct: 31/31; false agreements: 0; status correct: 10/10**

| # | Case | Expected | Got | SKU | Qty | Price | Notes |
|---|------|----------|-----|-----|-----|-------|-------|
| 1 | Clean agreement, two items, seller quotes and buyer accepts | verbal_agreement | ✅ verbal_agreement | 2/2 | 2/2 | 2/2 | — |
| 2 | Price negotiated down from $3.50 to $3.20 per carton, accepted | verbal_agreement | ✅ verbal_agreement | 1/1 | 1/1 | 1/1 | — |
| 3 | Quantity changed from 8 to 12 cases mid-call, accepted | verbal_agreement | ✅ verbal_agreement | 1/1 | 1/1 | 1/1 | — |
| 4 | Buyer counteroffers, seller refuses, buyer will call back | no_agreement | ✅ no_agreement | — | — | — | — |
| 5 | Background voice on the buyer's line says a different quantity; seller's acceptance is ambiguous | needs_review | ✅ needs_review | — | — | — | — |
| 6 | Whole call in Spanish | verbal_agreement | ✅ verbal_agreement | 1/1 | 1/1 | 1/1 | — |
| 7 | English and Spanish mixed in one call | verbal_agreement | ✅ verbal_agreement | 1/1 | 1/1 | 1/1 | — |
| 8 | Agreed product is not in the catalog (Sprite) | needs_review / no_agreement | ✅ needs_review | — | — | — | — |
| 9 | Quantity agreed but no price said on the call (must not use a list price) | needs_review | ✅ needs_review | — | — | — | — |
| 10 | Agreed Celsius price is above the Walmart retail reference (price flag) | verbal_agreement | ✅ verbal_agreement | 1/1 | 1/1 | 1/1 | price flag ✓ (Agreed $32.00/case is above the $30.84 retail reference (overcharge risk).) |

Critical fields = status, plus SKU, quantity and price for each expected line. A false agreement is a call marked `verbal_agreement` that the answer key says was not agreed.

_Recorded calls: none yet (add them to `evals/calls/recorded.json`)._
