import mongoose, { type InferSchemaType, Schema, Types } from "mongoose";

const { model, models } = mongoose;

/**
 * Registers a model. In development, Next.js keeps the old model in memory across reloads, so a changed
 * schema (for example a new enum value) would be silently ignored. Dropping the cached model fixes that.
 */
function defineModel(name: string, schema: Schema) {
  if (process.env.NODE_ENV !== "production" && models[name])
    mongoose.deleteModel(name);
  return models[name] || model(name, schema);
}
const opts = { timestamps: true } as const;
const oid = (ref: string, required = true) => ({
  type: Schema.Types.ObjectId,
  ref,
  required,
});

/* ---------- Users and auth ---------- */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, default: "" },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    usernameChosen: { type: Boolean, default: false },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["investor", "staff", "admin"],
      default: "investor",
    },
    /** Ordering controls set by an admin: a blocked customer cannot order; a limit overrides the tier limit. */
    shopBlocked: { type: Boolean, default: false },
    shopLimitUsdCents: Number,
    riskFlags: {
      type: [
        new Schema(
          {
            flag: String,
            note: String,
            by: String,
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    emailVerifiedAt: Date,
    balanceCents: { type: Number, default: 0, min: 0 },
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEnc: String,
      pendingSecretEnc: String,
      recoveryHashes: { type: [String], default: [] },
    },
    mfaPrompt: {
      snoozedUntil: Date,
      skips: { type: Number, default: 0 },
    },
    lastLoginAt: Date,
    emailSuppressed: {
      reason: String,
      at: Date,
    },
  },
  opts,
);
export const User = defineModel("User", userSchema);

const sessionSchema = new Schema(
  {
    userId: oid("User"),
    tokenHash: { type: String, required: true, unique: true },
    mfaVerified: { type: Boolean, default: true },
    userAgent: String,
    ip: String,
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  opts,
);
export const Session = defineModel("Session", sessionSchema);

const emailTokenSchema = new Schema(
  {
    userId: oid("User"),
    type: { type: String, enum: ["verify", "reset"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  opts,
);
export const EmailToken = defineModel("EmailToken", emailTokenSchema);

const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
export const RateLimit = defineModel("RateLimit", rateLimitSchema);

/* ---------- Catalogue (admin managed) ---------- */
const assetSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
    networks: [
      {
        name: { type: String, required: true },
        address: { type: String, default: "" },
        memo: { type: String, default: "" },
        /** Payment provider currency code (e.g. usdttrc20). Empty = guessed from the asset and network. */
        providerCode: { type: String, default: "" },
        active: { type: Boolean, default: true },
      },
    ],
  },
  opts,
);
export const Asset = defineModel("Asset", assetSchema);

/* ---------- Money ---------- */
const depositSchema = new Schema(
  {
    userId: oid("User"),
    asset: { type: String, required: true },
    network: { type: String, required: true },
    address: String,
    amountCents: { type: Number, required: true, min: 1 },
    /** What was actually credited if an admin credited a different amount than requested. */
    creditedCents: Number,
    txRef: { type: String, default: "" },
    /** Set when an online payment provider handles this payment. */
    provider: String,
    providerPaymentId: { type: String, index: true, sparse: true },
    providerStatus: String,
    lastSyncAt: Date,
    /** Short invoice number shown to the user, e.g. DEP-7K3Q9M. */
    reference: { type: String, unique: true, sparse: true },
    memo: String,
    /** Quote locked when the payment was created: units of the asset to send, and the USD rate used. */
    cryptoAmount: Number,
    rate: Number,
    expiresAt: Date,
    submittedAt: Date,
    /**
     * awaiting: created, waiting for the user to send funds. pending: user says they paid, our team is verifying.
     * approved / rejected: reviewed. expired / cancelled: never submitted.
     */
    status: {
      type: String,
      enum: [
        "awaiting",
        "pending",
        "approved",
        "rejected",
        "expired",
        "cancelled",
      ],
      default: "awaiting",
      index: true,
    },
    reason: String,
    reviewedBy: oid("User", false),
    reviewedAt: Date,
  },
  opts,
);
export const Deposit = defineModel("Deposit", depositSchema);

const withdrawalSchema = new Schema(
  {
    userId: oid("User"),
    /** Short number shown to the user and admins, e.g. WDR-7K3Q9M. */
    reference: { type: String, unique: true, sparse: true },
    asset: { type: String, required: true },
    network: { type: String, required: true },
    address: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 1 },
    /** Set when the payout is sent automatically by a payment provider. */
    provider: String,
    providerBatchId: String,
    providerPayoutId: { type: String, index: true, sparse: true },
    providerStatus: String,
    cryptoAmount: Number,
    /** Why a request is waiting for a person instead of being paid automatically. */
    holdReason: String,
    lastSyncAt: Date,
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    txHash: String,
    reason: String,
    reviewedBy: oid("User", false),
    reviewedAt: Date,
  },
  opts,
);
export const Withdrawal = defineModel("Withdrawal", withdrawalSchema);

const ledgerSchema = new Schema(
  {
    userId: oid("User"),
    type: {
      type: String,
      enum: [
        "deposit",
        "withdrawal_hold",
        "withdrawal_refund",
        "adjustment",
        "order_refund",
      ],
      required: true,
    },
    amountCents: { type: Number, required: true }, // signed: + credit, - debit
    balanceAfterCents: { type: Number, required: true },
    refType: String,
    refId: Schema.Types.ObjectId,
    note: String,
  },
  opts,
);
ledgerSchema.index({ userId: 1, createdAt: -1 });
export const LedgerEntry = defineModel("LedgerEntry", ledgerSchema);

/* ---------- Compliance and comms ---------- */
const kycSchema = new Schema(
  {
    userId: { ...oid("User"), unique: true },
    fullName: String,
    dateOfBirth: String,
    country: String,
    address: String,
    idType: String,
    idNumberEnc: String,
    idLast4: String,
    /** Uploaded ID images, stored privately at the file host. Never public URLs. */
    documents: [
      {
        _id: false,
        kind: { type: String, enum: ["front", "back", "selfie"] },
        publicId: String,
        format: String,
        bytes: Number,
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reason: String,
    reviewedBy: oid("User", false),
    reviewedAt: Date,
  },
  opts,
);
export const Kyc = defineModel("Kyc", kycSchema);

const notificationSchema = new Schema(
  {
    userId: oid("User"),
    title: { type: String, required: true },
    body: String,
    href: String,
    readAt: Date,
  },
  opts,
);
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = defineModel("Notification", notificationSchema);

const auditSchema = new Schema(
  {
    /** Empty for automatic actions taken by the system. */
    actorId: oid("User", false),
    actorEmail: String,
    action: { type: String, required: true },
    target: String,
    meta: Schema.Types.Mixed,
  },
  opts,
);
auditSchema.index({ createdAt: -1 });
export const AuditLog = defineModel("AuditLog", auditSchema);

const settingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: Schema.Types.Mixed,
});
export const Setting = defineModel("Setting", settingSchema);

/* ---------- Admin messaging ---------- */
const messageSchema = new Schema(
  {
    subject: { type: String, required: true },
    body: { type: String, required: true },
    templateKey: String,
    channels: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
    audience: {
      type: { type: String, required: true },
      label: String,
      userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },
    cta: { label: String, url: String },
    recipientCount: { type: Number, default: 0 },
    emailSent: { type: Number, default: 0 },
    emailFailed: { type: Number, default: 0 },
    inAppCount: { type: Number, default: 0 },
    sampleRecipients: { type: [String], default: [] },
    createdBy: oid("User"),
    createdByEmail: String,
  },
  opts,
);
messageSchema.index({ createdAt: -1 });
export const Message = defineModel("Message", messageSchema);

const messageTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    createdBy: oid("User"),
  },
  opts,
);
export const MessageTemplate = defineModel(
  "MessageTemplate",
  messageTemplateSchema,
);

/* ---------- Email reliability ---------- */
const emailLogSchema = new Schema(
  {
    to: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    html: String,
    text: String,
    kind: String,
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    /** Verify and reset emails carry tokens: their body is never stored and they are never retried. */
    sensitive: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [
        "sent",
        "delivered",
        "failed",
        "dead",
        "bounced",
        "complaint",
        "suppressed",
      ],
      default: "failed",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: String,
    messageId: { type: String, index: true },
    nextAttemptAt: Date,
    events: [{ type: { type: String }, at: Date, reason: String, _id: false }],
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  opts,
);
emailLogSchema.index({ createdAt: -1 });
export const EmailLog = defineModel("EmailLog", emailLogSchema);

/* ---------- Support ---------- */
const ticketSchema = new Schema(
  {
    userId: oid("User"),
    subject: { type: String, required: true },
    /** The order this ticket is about, when it was opened from an order. */
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    category: {
      type: String,
      enum: ["deposit", "withdrawal", "order", "account", "other"],
      default: "other",
    },
    /** open: waiting on us. pending: waiting on the user. closed: resolved. */
    status: {
      type: String,
      enum: ["open", "pending", "closed"],
      default: "open",
      index: true,
    },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageBy: { type: String, enum: ["user", "admin"], default: "user" },
    unreadByUser: { type: Boolean, default: false },
    unreadByAdmin: { type: Boolean, default: true },
    messageCount: { type: Number, default: 0 },
  },
  opts,
);
export const Ticket = defineModel("Ticket", ticketSchema);

const ticketMessageSchema = new Schema(
  {
    ticketId: { ...oid("Ticket"), index: true },
    authorId: oid("User"),
    authorRole: { type: String, enum: ["user", "admin"], required: true },
    body: { type: String, required: true },
    /** Admin-only note, never shown to the user. */
    internal: { type: Boolean, default: false },
  },
  opts,
);
export const TicketMessage = defineModel("TicketMessage", ticketMessageSchema);

const userNoteSchema = new Schema(
  {
    userId: { ...oid("User"), index: true },
    authorId: oid("User"),
    authorEmail: String,
    body: { type: String, required: true },
  },
  opts,
);
export const UserNote = defineModel("UserNote", userNoteSchema);

/* ---------- Growth ---------- */

const pushSubSchema = new Schema(
  {
    userId: { ...oid("User"), index: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    userAgent: String,
  },
  opts,
);
export const PushSubscription = defineModel("PushSubscription", pushSubSchema);

/** Makes a form submit safe to retry on a weak connection: the same key is only processed once. */
const idempotencySchema = new Schema({
  key: { type: String, required: true, unique: true },
  userId: Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now, index: { expires: 86400 } },
});
export const Idempotency = defineModel("Idempotency", idempotencySchema);

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
};

/* ---------- Catalogue (bills) ---------- */
/** Money here is always integer minor units (kobo for NGN, cents for USD). Markup percent is in basis points. */
const inputFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["phone", "number", "text", "email", "select"],
      default: "text",
    },
    required: { type: Boolean, default: true },
    /** Optional regular expression the value must match (checked on the server). */
    pattern: String,
    options: { type: [String], default: [] },
  },
  { _id: false },
);
const markupSchema = new Schema(
  {
    type: { type: String, enum: ["percent", "fixed"], required: true },
    /** percent: basis points (500 = 5%). fixed: minor units of the product currency. */
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const serviceCategorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    icon: { type: String, default: "Package" },
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    inputs: { type: [inputFieldSchema], default: [] },
    /** Overrides the default markup for every product in the category that has no markup of its own. */
    markup: { type: markupSchema, required: false },
  },
  opts,
);
export const ServiceCategory = defineModel(
  "ServiceCategory",
  serviceCategorySchema,
);

const providerSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    mode: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
    active: { type: Boolean, default: true },
    /** Lower number is tried first when two providers sell the same product. */
    priority: { type: Number, default: 0 },
    lowBalanceMinor: { type: Number, default: 0, min: 0 },
    lastBalanceMinor: Number,
    lastBalanceCurrency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    lastCheckedAt: Date,
    status: { type: String, default: "unchecked" },
    lastLowAlertAt: Date,
  },
  opts,
);
export const Provider = defineModel("Provider", providerSchema);

const productSchema = new Schema(
  {
    categoryId: oid("ServiceCategory"),
    providerKey: { type: String, required: true, lowercase: true },
    providerCode: { type: String, required: true },
    name: { type: String, required: true },
    logo: String,
    /** fixed: the customer picks a denomination. open: the customer types an amount between min and max. */
    kind: { type: String, enum: ["fixed", "open"], required: true },
    denominations: {
      type: [
        new Schema(
          {
            label: { type: String, required: true },
            /** What the customer receives (face value) in minor units. */
            valueMinor: { type: Number, required: true, min: 1 },
            /** What the provider charges us. */
            costMinor: { type: Number, required: true, min: 1 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    minMinor: { type: Number, min: 0, default: 0 },
    maxMinor: { type: Number, min: 0, default: 0 },
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    /** Open products: our cost as basis points of the face value (10000 = we pay full face value). */
    costBps: { type: Number, min: 1, default: 10000 },
    markup: { type: markupSchema, required: false },
    inputs: { type: [inputFieldSchema], default: [] },
    status: {
      type: String,
      enum: ["active", "hidden", "out_of_stock"],
      default: "active",
    },
    sort: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    /** Codes and tokens can be revealed once only. */
    viewOnce: { type: Boolean, default: false },
    /** Allow the code in the delivery email. Off by default: codes are shown only on the order page. */
    emailCodes: { type: Boolean, default: false },
  },
  opts,
);
productSchema.index({ providerKey: 1, providerCode: 1 }, { unique: true });
productSchema.index({ categoryId: 1, status: 1, sort: 1 });
export const Product = defineModel("Product", productSchema);

const floatTopUpSchema = new Schema(
  {
    providerKey: { type: String, required: true, lowercase: true },
    amountMinor: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },
    by: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  opts,
);
floatTopUpSchema.index({ providerKey: 1, at: -1 });
export const FloatTopUp = defineModel("FloatTopUp", floatTopUpSchema);

/* ---------- Orders ---------- */
export const ORDER_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "fulfilling",
  "delivered",
  "failed",
  "refunded",
  "review",
  "expired",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const orderSchema = new Schema(
  {
    /** ORD-XXXXXX. Also the id sent to the payment provider, so a payment can always be traced to its order. */
    number: { type: String, required: true, unique: true },
    userId: oid("User"),
    productId: oid("Product"),
    categorySlug: { type: String, required: true },
    /** What the customer was shown, frozen at creation. Later price changes never touch an existing order. */
    snapshot: {
      productName: String,
      providerKey: String,
      providerCode: String,
      optionLabel: String,
      /** What the customer receives, in minor units of `currency`. */
      valueMinor: Number,
      costMinor: Number,
      marginMinor: Number,
      markupSource: String,
      kind: String,
      /** Naira per US dollar used to price this order. Null when the product is priced in USD only. */
      fxNgnPerUsd: Number,
    },
    /** Validated customer inputs (phone, meter, smartcard, email). */
    inputs: { type: Schema.Types.Mixed, default: {} },
    /** What the customer pays, in minor units of `currency`. */
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["NGN", "USD"], required: true },
    /** The same price in US cents, which is what the crypto payment is quoted from. */
    amountUsdCents: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ORDER_STATUSES, default: "created" },
    payment: {
      provider: String,
      paymentId: String,
      address: String,
      memo: String,
      payAsset: String,
      payNetwork: String,
      /** Crypto amount quoted by the provider, locked until `expiresAt`. */
      payAmount: Number,
      /** Our view of the payment: waiting, confirming, paid, underpaid, failed, expired. */
      status: String,
      /** The provider's own status word. */
      providerStatus: String,
      actuallyPaid: Number,
      /** Crypto received above the quoted amount (more than 1%), if any. A person decides about the difference. */
      overpaidBy: Number,
      expiresAt: Date,
      paidAt: Date,
      lastSyncAt: Date,
    },
    fulfilment: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: Date,
      /** The id sent to the fulfilment provider. Made once and kept. */
      requestId: String,
      providerRef: String,
      providerStatus: String,
      deliveredAt: Date,
      /** Set just before the purchase is first sent. If it is set, the purchase may have reached the provider. */
      purchaseSentAt: Date,
      /** When the next automatic check or retry is due. */
      nextAttemptAt: Date,
      /** Only one worker may advance an order at a time: it holds this lease until it expires. */
      lockUntil: Date,
      lastError: String,
    },
    /** Electricity tokens and other codes, encrypted at rest (lib/crypto). Written in Phase 5. */
    delivery: {
      encryptedPayload: String,
      viewedAt: Date,
    },
    refund: {
      type: { type: String, enum: ["credit", "crypto"] },
      /** Credit refunds are in US cents (store credit is held in dollars). */
      amountMinor: Number,
      currency: String,
      reason: String,
      at: Date,
    },
    reviewReason: String,
    idempotencyKey: String,
  },
  opts,
);
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.paymentId": 1 }, { unique: true, sparse: true });
orderSchema.index({ "payment.expiresAt": 1, status: 1 });
export const Order = defineModel("Order", orderSchema);

const orderEventSchema = new Schema(
  {
    orderId: oid("Order"),
    type: { type: String, required: true },
    /** "system", "user", or an admin id. */
    actor: { type: String, default: "system" },
    from: String,
    to: String,
    message: String,
    meta: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
orderEventSchema.index({ orderId: 1, at: 1 });
export const OrderEvent = defineModel("OrderEvent", orderEventSchema);
