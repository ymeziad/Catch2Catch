import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared schema for Catch2Catch. All money in integer cents.

const party = v.union(v.literal("buyer"), v.literal("seller"));

export default defineSchema({
  shops: defineTable({
    name: v.string(),
    phone: v.string(),
    contactName: v.string(),
    language: v.string(), // "en" | "es" | other
    paymentTermsDays: v.number(),
    autoApproveLimitCents: v.number(),
    trackRecordSummary: v.optional(v.string()), // C2C AI summary of the shop's history
    trackRecordAt: v.optional(v.number()),
  }).index("by_phone", ["phone"]),

  calls: defineTable({
    twilioCallSid: v.string(),
    buyerPhone: v.string(),
    sellerPhone: v.string(),
    shopId: v.optional(v.id("shops")),
    buyerConsent: v.boolean(),
    sellerConsent: v.boolean(),
    recordingSid: v.optional(v.string()),
    recordingFileId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("in_progress"),
      v.literal("recorded"),
      v.literal("transcribing"),
      v.literal("analyzing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_twilioCallSid", ["twilioCallSid"])
    .index("by_buyerPhone", ["buyerPhone"])
    .index("by_startedAt", ["startedAt"]),

  transcriptSegments: defineTable({
    callId: v.id("calls"),
    role: party,
    startMs: v.number(),
    endMs: v.number(),
    text: v.string(),
    confidence: v.optional(v.number()),
  }).index("by_callId", ["callId", "startMs"]),

  catalogProducts: defineTable({
    sku: v.string(),
    brand: v.string(),
    name: v.string(),
    unit: v.string(),
    unitsPerCase: v.number(),
    aliases: v.array(v.string()),
    barcode: v.optional(v.string()),
    priceWholesaleCents: v.optional(v.number()),
    priceRetailRefCents: v.optional(v.number()),
    priceRefSource: v.optional(v.string()),
    priceUpdatedAt: v.optional(v.number()),
  })
    .index("by_sku", ["sku"])
    .index("by_barcode", ["barcode"]),

  orders: defineTable({
    callId: v.id("calls"),
    shopId: v.optional(v.id("shops")),
    status: v.union(
      v.literal("verbal_agreement"),
      v.literal("no_agreement"),
      v.literal("needs_review"),
      v.literal("confirmed"),
      v.literal("disputed"),
      v.literal("cancelled"),
    ),
    lines: v.array(
      v.object({
        sku: v.string(),
        description: v.string(),
        qty: v.number(),
        unit: v.string(),
        unitPriceCents: v.optional(v.number()),
        lineTotalCents: v.optional(v.number()),
        confidence: v.number(),
        evidenceStartMs: v.optional(v.number()),
        evidenceRole: v.optional(party),
      }),
    ),
    deliveryDate: v.optional(v.string()),
    paymentTerms: v.optional(v.string()),
    openIssues: v.array(v.string()),
    priceFlags: v.array(
      v.object({
        sku: v.string(),
        agreedCents: v.number(),
        refCents: v.number(),
        note: v.string(),
      }),
    ),
    summaryText: v.string(),
    buyerConfirmedAt: v.optional(v.number()),
    sellerConfirmedAt: v.optional(v.number()),
    totalCents: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_callId", ["callId"])
    .index("by_shopId", ["shopId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  orderEvents: defineTable({
    orderId: v.id("orders"),
    field: v.string(),
    value: v.string(),
    proposedBy: party,
    acceptedBy: v.optional(party),
    rejectedBy: v.optional(party),
    atMs: v.number(),
    quote: v.string(),
  }).index("by_orderId", ["orderId"]),

  packingChecks: defineTable({
    orderId: v.id("orders"),
    packerName: v.string(),
    scans: v.array(
      v.object({ barcode: v.string(), sku: v.optional(v.string()), qty: v.number() }),
    ),
    photoFileIds: v.array(v.id("_storage")),
    result: v.union(v.literal("match"), v.literal("mismatch"), v.literal("override")),
    mismatches: v.array(
      v.object({ sku: v.string(), expectedQty: v.number(), scannedQty: v.number() }),
    ),
    overrideBy: v.optional(v.string()),
    overrideReason: v.optional(v.string()),
    checkedAt: v.number(),
  }).index("by_orderId", ["orderId"]),

  invoices: defineTable({
    orderId: v.id("orders"),
    shopId: v.id("shops"),
    amountCents: v.number(),
    balanceCents: v.number(),
    issuedAt: v.number(),
    dueAt: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("partially_paid"),
      v.literal("paid"),
      v.literal("disputed"),
      v.literal("credited"),
    ),
  })
    .index("by_orderId", ["orderId"])
    .index("by_shopId", ["shopId", "issuedAt"])
    .index("by_status", ["status", "dueAt"]),

  payments: defineTable({
    invoiceId: v.id("invoices"),
    amountCents: v.number(),
    method: v.string(),
    receivedAt: v.number(),
    note: v.optional(v.string()),
  }).index("by_invoiceId", ["invoiceId"]),

  disputes: defineTable({
    invoiceId: v.id("invoices"),
    orderId: v.id("orders"),
    shopId: v.id("shops"),
    shopMessage: v.string(),
    claimedItems: v.array(v.object({ sku: v.string(), qty: v.number(), reason: v.string() })),
    recommendation: v.optional(
      v.union(
        v.literal("credit"),
        v.literal("cash_refund"),
        v.literal("replacement"),
        v.literal("reject_with_evidence"),
        v.literal("escalate"),
      ),
    ),
    reasoning: v.optional(v.string()),
    summary: v.optional(v.string()), // one plain line for the owner's to-do list
    shopMessageClean: v.optional(v.string()), // the shop's latest text, rewritten in clean English, same meaning
    evidenceRefs: v.array(v.object({ type: v.string(), id: v.string(), detail: v.string() })),
    amountCents: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("awaiting_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("resolved"),
    ),
    requestedBy: v.string(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_shopId", ["shopId"])
    .index("by_status", ["status"]),

  ledgerEntries: defineTable({
    entryGroupId: v.string(),
    date: v.number(),
    account: v.union(
      v.literal("accounts_receivable"),
      v.literal("sales"),
      v.literal("cash"),
      v.literal("sales_returns"),
    ),
    debitCents: v.number(),
    creditCents: v.number(),
    refType: v.string(),
    refId: v.string(),
    memo: v.string(),
  })
    .index("by_entryGroupId", ["entryGroupId"])
    .index("by_date", ["date"]),

  reminders: defineTable({
    kind: v.union(
      v.literal("order_unconfirmed"),
      v.literal("payment_due_soon"),
      v.literal("payment_due"),
      v.literal("payment_late"),
      v.literal("escalate_owner"),
    ),
    invoiceId: v.optional(v.id("invoices")),
    orderId: v.optional(v.id("orders")),
    scheduledFor: v.number(),
    sentAt: v.optional(v.number()),
    status: v.union(v.literal("scheduled"), v.literal("sent"), v.literal("cancelled")),
    messageId: v.optional(v.id("messages")),
  })
    .index("by_status_scheduledFor", ["status", "scheduledFor"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_orderId", ["orderId"]),

  messages: defineTable({
    direction: v.union(v.literal("out"), v.literal("in")),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    relatedType: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    twilioSid: v.optional(v.string()),
    status: v.union(
      v.literal("sent"),
      v.literal("simulated"),
      v.literal("failed"),
      v.literal("received"),
    ),
    channel: v.optional(v.union(v.literal("sms"), v.literal("whatsapp"))),
    // Carrier delivery result reported by Twilio's status callback.
    deliveryStatus: v.optional(v.string()), // queued | sending | sent | delivered | undelivered | failed
    deliveryError: v.optional(v.string()), // e.g. "30034: sender number not registered for A2P 10DLC"
    deliveryUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_to", ["to", "createdAt"])
    .index("by_from", ["from", "createdAt"])
    .index("by_twilioSid", ["twilioSid"]),

  auditLog: defineTable({
    actor: v.union(
      v.literal("agent"),
      v.literal("owner"),
      v.literal("packer"),
      v.literal("system"),
      v.literal("shop"),
    ),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    reason: v.string(),
    evidenceRefs: v.optional(
      v.array(v.object({ type: v.string(), id: v.string(), detail: v.optional(v.string()) })),
    ),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_entity", ["entityType", "entityId"]),

  settings: defineTable({
    demoClockOffsetMs: v.number(),
    ownerPhone: v.string(),
    ownerLang: v.optional(v.string()), // "en" | "es": the dashboard and the voice use it
    lastMorningTextDay: v.optional(v.string()), // no longer used (kept so existing rows still match the schema)
  }),

  // Claude translations of text that isn't fixed in the app (AI summaries, shop texts), cached so each is paid for once.
  translations: defineTable({
    key: v.string(), // lang + hash of the source text
    lang: v.string(),
    source: v.string(),
    text: v.string(),
  }).index("by_key", ["key"]),

  // "Read it to me" audio from ElevenLabs, cached so repeating the same words costs nothing.
  voiceClips: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
  }).index("by_key", ["key"]),
});
