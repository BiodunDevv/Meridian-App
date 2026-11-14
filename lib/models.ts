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
    role: { type: String, enum: ["investor", "admin"], default: "investor" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    emailVerifiedAt: Date,
    balanceCents: { type: Number, default: 0, min: 0 },
    pendingPlanSlug: String,
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
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
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

const planSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tagline: String,
    minCents: { type: Number, required: true },
    maxCents: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    /** Fixed percentage credited every day on the running balance. The source of truth. */
    dailyPct: Number,
    /** Total return over the term, derived from dailyPct. Kept for display and sorting. */
    projectedPct: { type: Number, required: true },
    featured: { type: Boolean, default: false },
    badge: String,
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  opts,
);
export const Plan = defineModel("Plan", planSchema);

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

const investmentSchema = new Schema(
  {
    userId: oid("User"),
    planId: oid("Plan"),
    planName: String,
    planSlug: String,
    principalCents: { type: Number, required: true },
    projectedPct: Number,
    dailyPct: Number,
    durationDays: Number,
    totalProfitCents: { type: Number, required: true },
    accruedCents: { type: Number, default: 0 },
    accruedDays: { type: Number, default: 0 },
    offerNotifiedAt: Date,
    autoCompound: { type: Boolean, default: false },
    parentId: { type: Schema.Types.ObjectId, ref: "Investment" },
    compoundedFrom: { type: Schema.Types.ObjectId, ref: "Investment" },
    kind: { type: String, enum: ["new", "topup", "reinvest"], default: "new" },
    startedAt: { type: Date, default: Date.now },
    maturesAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "matured"],
      default: "active",
      index: true,
    },
  },
  opts,
);
export const Investment = defineModel("Investment", investmentSchema);

const ledgerSchema = new Schema(
  {
    userId: oid("User"),
    type: {
      type: String,
      enum: [
        "deposit",
        "investment",
        "profit",
        "principal_return",
        "withdrawal_hold",
        "withdrawal_refund",
        "adjustment",
        "referral_bonus",
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
    category: {
      type: String,
      enum: ["deposit", "withdrawal", "investment", "account", "other"],
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
const referralSchema = new Schema(
  {
    referrerId: { ...oid("User"), index: true },
    referredId: { ...oid("User"), unique: true },
    status: { type: String, enum: ["joined", "rewarded"], default: "joined" },
    rewardCents: { type: Number, default: 0 },
    depositId: { type: Schema.Types.ObjectId, ref: "Deposit" },
    rewardedAt: Date,
  },
  opts,
);
export const Referral = defineModel("Referral", referralSchema);

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
