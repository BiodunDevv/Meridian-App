import type { Model } from "mongoose";

import { connectDb } from "../db";
import {
  AuditLog,
  Deposit,
  EmailLog,
  Kyc,
  LedgerEntry,
  Order,
  Product,
  Ticket,
  User,
  Withdrawal,
} from "../models";
import { formatDateTime, formatUsd } from "../money";

export const PAGE_SIZE = 25;
export const EXPORT_LIMIT = 20_000;

/** URL query values every admin table understands. */
export interface TableParams {
  q?: string;
  status?: string;
  type?: string;
  asset?: string;
  plan?: string;
  category?: string;
  role?: string;
  verified?: string;
  kyc?: string;
  from?: string;
  to?: string;
  /** Fixed filter used on a user's detail page. */
  userId?: string;
  page?: number;
}

type SP = Record<string, string | string[] | undefined>;

export function parseParams(sp: SP): TableParams {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const page = Math.max(1, parseInt(one("page") ?? "1", 10) || 1);
  return {
    q: one("q"),
    status: one("status"),
    type: one("type"),
    asset: one("asset"),
    plan: one("plan"),
    category: one("category"),
    role: one("role"),
    verified: one("verified"),
    kyc: one("kyc"),
    from: one("from"),
    to: one("to"),
    userId: one("userId"),
    page,
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Def {
  model: Model<unknown>;
  searchFields: string[];
  /** Also match when the row's user (userId) matches the search text. */
  userSearch?: boolean;
  userField?: string;
  populate?: string;
  extra?: (
    p: TableParams,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  csvHeader: string[];
  csvRow: (
    d: Record<string, unknown> & { userId?: { email?: string } },
  ) => (string | number)[];
}

const email = (d: { userId?: { email?: string } }) => d.userId?.email ?? "";
const dt = (v: unknown) => (v ? formatDateTime(v as string) : "");
const usd = (v: unknown) => formatUsd(Number(v ?? 0));

const defs: Record<string, Def> = {
  users: {
    model: User,
    searchFields: ["email", "username", "name"],
    extra: async (p) => {
      const f: Record<string, unknown> = {};
      if (p.status) f.status = p.status;
      if (p.role) f.role = p.role;
      if (p.verified === "yes") f.emailVerifiedAt = { $exists: true };
      if (p.verified === "no") f.emailVerifiedAt = { $exists: false };
      if (p.kyc) {
        const ids = await Kyc.distinct(
          "userId",
          p.kyc === "none" ? {} : { status: p.kyc },
        );
        f._id = p.kyc === "none" ? { $nin: ids } : { $in: ids };
      }
      return f;
    },
    csvHeader: [
      "Email",
      "Username",
      "Name",
      "Role",
      "Status",
      "Verified",
      "Balance",
      "Joined",
      "Last login",
    ],
    csvRow: (d) => [
      String(d.email),
      String(d.username ?? ""),
      String(d.name ?? ""),
      String(d.role),
      String(d.status),
      d.emailVerifiedAt ? "yes" : "no",
      usd(d.balanceCents),
      dt(d.createdAt),
      dt(d.lastLoginAt),
    ],
  },
  deposits: {
    model: Deposit,
    searchFields: ["txRef", "asset", "network", "reference"],
    userSearch: true,
    populate: "userId",
    extra: (p) => ({
      ...(p.status ? { status: p.status } : {}),
      ...(p.asset ? { asset: p.asset } : {}),
    }),
    csvHeader: [
      "Date",
      "Reference",
      "User",
      "Asset",
      "Network",
      "Amount",
      "Expected crypto",
      "Status",
      "Tx ref",
      "Reason",
    ],
    csvRow: (d) => [
      dt(d.createdAt),
      String(d.reference ?? ""),
      email(d),
      String(d.asset),
      String(d.network),
      usd(d.amountCents),
      String(d.cryptoAmount ?? ""),
      String(d.status),
      String(d.txRef ?? ""),
      String(d.reason ?? ""),
    ],
  },
  withdrawals: {
    model: Withdrawal,
    searchFields: ["reference", "address", "txHash", "asset", "network"],
    userSearch: true,
    populate: "userId",
    extra: (p) => ({
      ...(p.status ? { status: p.status } : {}),
      ...(p.asset ? { asset: p.asset } : {}),
    }),
    csvHeader: [
      "Date",
      "Reference",
      "User",
      "Asset",
      "Network",
      "Amount",
      "Status",
      "Address",
      "Tx hash",
      "Reason",
    ],
    csvRow: (d) => [
      dt(d.createdAt),
      String(d.reference ?? ""),
      email(d),
      String(d.asset),
      String(d.network),
      usd(d.amountCents),
      String(d.status),
      String(d.address),
      String(d.txHash ?? ""),
      String(d.reason ?? ""),
    ],
  },
  orders: {
    model: Order,
    searchFields: [
      "number",
      "snapshot.productName",
      "payment.paymentId",
      "reviewReason",
    ],
    userSearch: true,
    populate: "userId",
    extra: (p) => ({
      ...(p.status ? { status: p.status } : {}),
      ...(p.category ? { categorySlug: p.category } : {}),
    }),
    csvHeader: [
      "Created",
      "Order",
      "User",
      "Item",
      "Category",
      "Price",
      "Currency",
      "Status",
      "Paid with",
      "Cost",
      "Margin",
    ],
    csvRow: (d) => {
      const snap = (d.snapshot ?? {}) as Record<string, unknown>;
      const pay = (d.payment ?? {}) as Record<string, unknown>;
      return [
        dt(d.createdAt),
        String(d.number),
        email(d),
        String(snap.productName ?? ""),
        String(d.categorySlug ?? ""),
        Number(d.amountMinor ?? 0) / 100,
        String(d.currency),
        String(d.status),
        String(pay.payAsset ?? ""),
        Number(snap.costMinor ?? 0) / 100,
        Number(snap.marginMinor ?? 0) / 100,
      ];
    },
  },
  products: {
    model: Product,
    searchFields: ["name", "providerCode", "providerKey"],
    extra: (p) => ({
      ...(p.status ? { status: p.status } : {}),
    }),
    csvHeader: [
      "Name",
      "Provider",
      "Provider code",
      "Kind",
      "Currency",
      "Status",
      "Denominations",
      "Min",
      "Max",
    ],
    csvRow: (d) => [
      String(d.name),
      String(d.providerKey),
      String(d.providerCode),
      String(d.kind),
      String(d.currency),
      String(d.status),
      Array.isArray(d.denominations) ? d.denominations.length : 0,
      Number(d.minMinor ?? 0) / 100,
      Number(d.maxMinor ?? 0) / 100,
    ],
  },
  transactions: {
    model: LedgerEntry,
    searchFields: ["note"],
    userSearch: true,
    populate: "userId",
    extra: (p) => (p.type ? { type: p.type } : {}),
    csvHeader: ["Date", "User", "Type", "Detail", "Amount", "Balance after"],
    csvRow: (d) => [
      dt(d.createdAt),
      email(d),
      String(d.type),
      String(d.note ?? ""),
      usd(d.amountCents),
      usd(d.balanceAfterCents),
    ],
  },
  audit: {
    model: AuditLog,
    searchFields: ["action", "actorEmail", "target"],
    extra: (p) => (p.type ? { action: { $regex: `^${esc(p.type)}` } } : {}),
    csvHeader: ["When", "Admin", "Action", "Target"],
    csvRow: (d) => [
      dt(d.createdAt),
      String(d.actorEmail ?? ""),
      String(d.action),
      String(d.target ?? ""),
    ],
  },
  emails: {
    model: EmailLog,
    searchFields: ["to", "subject", "kind"],
    extra: (p) => (p.status ? { status: p.status } : {}),
    csvHeader: [
      "When",
      "To",
      "Subject",
      "Kind",
      "Status",
      "Attempts",
      "Last error",
    ],
    csvRow: (d) => [
      dt(d.createdAt),
      String(d.to),
      String(d.subject),
      String(d.kind ?? ""),
      String(d.status),
      Number(d.attempts ?? 0),
      String(d.lastError ?? ""),
    ],
  },
  tickets: {
    model: Ticket,
    searchFields: ["subject"],
    userSearch: true,
    populate: "userId",
    extra: (p) => ({
      ...(p.status ? { status: p.status } : {}),
      ...(p.category ? { category: p.category } : {}),
    }),
    csvHeader: [
      "Opened",
      "User",
      "Subject",
      "Category",
      "Status",
      "Messages",
      "Last message",
    ],
    csvRow: (d) => [
      dt(d.createdAt),
      email(d),
      String(d.subject),
      String(d.category),
      String(d.status),
      Number(d.messageCount ?? 0),
      dt(d.lastMessageAt),
    ],
  },
};

export type ResourceKey = keyof typeof defs;
export const isResource = (k: string): k is ResourceKey => k in defs;

async function buildFilter(def: Def, p: TableParams) {
  const and: Record<string, unknown>[] = [];
  if (def.extra) and.push(await def.extra(p));
  if (p.userId) and.push({ [def.userField ?? "userId"]: p.userId });
  if (p.from || p.to) {
    const range: Record<string, Date> = {};
    if (p.from) range.$gte = new Date(`${p.from}T00:00:00.000Z`);
    if (p.to) range.$lte = new Date(`${p.to}T23:59:59.999Z`);
    and.push({ createdAt: range });
  }
  if (p.q) {
    const rx = new RegExp(esc(p.q), "i");
    const or: Record<string, unknown>[] = def.searchFields.map((f) => ({
      [f]: rx,
    }));
    if (def.userSearch) {
      const ids = await User.find({
        $or: [{ email: rx }, { username: rx }, { name: rx }],
      })
        .select("_id")
        .limit(200)
        .lean();
      if (ids.length) or.push({ userId: { $in: ids.map((u) => u._id) } });
    }
    and.push({ $or: or });
  }
  return and.length ? { $and: and } : {};
}

/** One page of rows, as plain JSON, plus the total match count. */
export async function queryResource(
  key: ResourceKey,
  p: TableParams,
  pageSize = PAGE_SIZE,
) {
  await connectDb();
  const def = defs[key];
  const filter = await buildFilter(def, p);
  const page = p.page ?? 1;
  let q = def.model
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);
  if (def.populate) q = q.populate(def.populate, "email username");
  const [rows, total] = await Promise.all([
    q.lean(),
    def.model.countDocuments(filter),
  ]);
  return {
    rows: JSON.parse(JSON.stringify(rows)),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const cell = (v: string | number) => {
  let s = String(v ?? "");
  // Stop spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Every matching row (up to EXPORT_LIMIT) as CSV text. */
export async function exportCsv(key: ResourceKey, p: TableParams) {
  await connectDb();
  const def = defs[key];
  const filter = await buildFilter(def, p);
  let q = def.model.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT);
  if (def.populate) q = q.populate(def.populate, "email username");
  const rows = (await q.lean()) as unknown as Parameters<Def["csvRow"]>[0][];
  const lines = [
    def.csvHeader.map(cell).join(","),
    ...rows.map((r) => def.csvRow(r).map(cell).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}

/** Query values to carry through pagination links. */
export function paramsToQuery(
  p: TableParams,
): Record<string, string | undefined> {
  const { page: _page, ...rest } = p;
  return rest as Record<string, string | undefined>;
}
