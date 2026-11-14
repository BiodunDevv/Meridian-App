import { ArrowLeft, BadgeCheck, Mail, ShieldCheck } from "lucide-react";
import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addUserNoteAction,
  clearSuppressionAction,
  deleteUserNoteAction,
  reviewKycAction,
  setUserStatusAction,
} from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/app/form";
import { IconInput } from "@/components/app/icon-input";
import { KycDocuments } from "@/components/app/kyc-documents";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import { ConfirmAction, ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  LEDGER_LABEL,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/app/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  paramsToQuery,
  parseParams,
  queryResource,
  type ResourceKey,
} from "@/lib/admin/resources";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import {
  AuditLog,
  Deposit,
  Investment,
  Kyc,
  LedgerEntry,
  Referral,
  Session,
  User,
  UserNote,
  Withdrawal,
} from "@/lib/models";
import { formatDate, formatDateTime, formatUsd } from "@/lib/money";
import { fullIdNumber } from "@/lib/services/kyc";
import { audit } from "@/lib/services/notify";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "User" };

const TABS = [
  ["overview", "Overview"],
  ["ledger", "Ledger"],
  ["deposits", "Deposits"],
  ["withdrawals", "Withdrawals"],
  ["investments", "Investments"],
  ["identity", "Identity"],
  ["support", "Support"],
] as const;
type Tab = (typeof TABS)[number][0];

const RESOURCE: Partial<Record<Tab, ResourceKey>> = {
  ledger: "transactions",
  deposits: "deposits",
  withdrawals: "withdrawals",
  investments: "investments",
  support: "tickets",
};

type Row = Record<string, string | number | boolean | undefined>;

export default async function UserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;
  await connectDb();
  const user = await User.findById(id)
    .lean()
    .catch(() => null);
  if (!user) notFound();
  const u = plain(user) as Record<string, any>;

  const [kyc, dep, wd, active, profit, refCount, sessions] = await Promise.all([
    Kyc.findOne({ userId: id }).lean(),
    Deposit.aggregate([
      { $match: { userId: user._id, status: "approved" } },
      { $group: { _id: null, t: { $sum: "$amountCents" } } },
    ]),
    Withdrawal.aggregate([
      { $match: { userId: user._id, status: "paid" } },
      { $group: { _id: null, t: { $sum: "$amountCents" } } },
    ]),
    Investment.aggregate([
      { $match: { userId: user._id, status: "active" } },
      { $group: { _id: null, t: { $sum: "$principalCents" }, n: { $sum: 1 } } },
    ]),
    LedgerEntry.aggregate([
      { $match: { userId: user._id, type: "profit" } },
      { $group: { _id: null, t: { $sum: "$amountCents" } } },
    ]),
    Referral.countDocuments({ referrerId: id }),
    Session.countDocuments({ userId: id, expiresAt: { $gt: new Date() } }),
  ]);
  const k = plain(kyc) as Record<string, any> | null;
  if (tab === "identity" && k) await audit(admin, "kyc.view_id", String(k._id));
  const initials = (u.username || u.email).slice(0, 2).toUpperCase();
  const base = `/admin/users/${id}`;

  // Table tabs
  const table = RESOURCE[tab];
  const tp = parseParams(sp);
  const data = table ? await queryResource(table, { ...tp, userId: id }) : null;
  const query = { ...paramsToQuery({ ...tp, userId: undefined }), tab };

  return (
    <>
      <Link
        href="/admin/users"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="bg-brand/10 text-brand flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold">
            {initials}
          </span>
          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {u.email}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              {u.username && (
                <span className="text-muted-foreground">@{u.username}</span>
              )}
              <StatusBadge status={u.status} />
              {u.role === "admin" && (
                <Badge
                  variant="outline"
                  className="border-gold/60 text-gold-foreground"
                >
                  Admin
                </Badge>
              )}
              <Badge
                variant="outline"
                className={
                  u.emailVerifiedAt ? "text-success" : "text-muted-foreground"
                }
              >
                <Mail className="size-3" />{" "}
                {u.emailVerifiedAt ? "Email verified" : "Email not verified"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  u.mfa?.enabled ? "text-success" : "text-muted-foreground"
                }
              >
                <ShieldCheck className="size-3" />{" "}
                {u.mfa?.enabled ? "2FA on" : "2FA off"}
              </Badge>
              {k && (
                <Badge variant="outline" className="capitalize">
                  <BadgeCheck className="size-3" /> KYC {k.status}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {u._id !== admin.id && (
          <ToastForm action={setUserStatusAction}>
            <input type="hidden" name="id" value={u._id} />
            <input
              type="hidden"
              name="status"
              value={u.status === "active" ? "suspended" : "active"}
            />
            <SubmitButton
              size="default"
              variant={u.status === "active" ? "outline" : "default"}
            >
              {u.status === "active" ? "Suspend account" : "Reactivate account"}
            </SubmitButton>
          </ToastForm>
        )}
      </div>

      {u.emailSuppressed?.reason && (
        <div className="border-destructive-foreground/40 bg-destructive-foreground/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span>
            Emails to this address are blocked (
            {String(u.emailSuppressed.reason).replace("_", " ")}). The user is
            not receiving email.
          </span>
          <ToastForm action={clearSuppressionAction}>
            <input type="hidden" name="id" value={u._id} />
            <SubmitButton size="sm" variant="outline">
              Re-enable email
            </SubmitButton>
          </ToastForm>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Balance" value={formatUsd(u.balanceCents)} />
        <StatCard label="Deposited" value={formatUsd(dep[0]?.t ?? 0)} />
        <StatCard label="Withdrawn" value={formatUsd(wd[0]?.t ?? 0)} />
        <StatCard
          label="Invested now"
          value={formatUsd(active[0]?.t ?? 0)}
          hint={`${active[0]?.n ?? 0} active`}
        />
        <StatCard
          label="Profit paid"
          value={formatUsd(profit[0]?.t ?? 0)}
          tone={profit[0]?.t > 0 ? "positive" : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <nav
        aria-label="User sections"
        className="-mx-1 flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto border-b px-1"
      >
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? "border-brand text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <Overview u={u} id={id} sessions={sessions} refCount={refCount} />
      )}

      {tab === "identity" && (
        <Panel title="Identity (KYC)">
          {!k ? (
            <EmptyState
              title="No identity submitted"
              body="This user has not started verification."
            />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Status", <StatusBadge key="s" status={k.status} />],
                  ["Full name", k.fullName],
                  ["Date of birth", k.dateOfBirth],
                  ["Country", k.country],
                  ["Address", k.address],
                  [k.idType, fullIdNumber(k.idNumberEnc)],
                  [
                    "Reviewed",
                    k.reviewedAt ? formatDateTime(k.reviewedAt) : "Not yet",
                  ],
                  ["Reason", k.reason ?? "None"],
                ].map(([l, v]) => (
                  <div key={String(l)}>
                    <dt className="text-muted-foreground">{l}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t pt-4">
                <KycDocuments userId={id} documents={k.documents} />
              </div>
              {k.status === "pending" && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <ToastForm action={reviewKycAction}>
                    <input type="hidden" name="id" value={k._id} />
                    <input type="hidden" name="decision" value="approve" />
                    <SubmitButton size="sm">Approve</SubmitButton>
                  </ToastForm>
                  <ToastForm
                    action={reviewKycAction}
                    className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
                  >
                    <input type="hidden" name="id" value={k._id} />
                    <input type="hidden" name="decision" value="reject" />
                    <IconInput
                      name="reason"
                      placeholder="Reason"
                      className="h-8 w-full sm:w-48"
                      aria-label="Rejection reason"
                    />
                    <SubmitButton size="sm" variant="outline">
                      Reject
                    </SubmitButton>
                  </ToastForm>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {table && data && (
        <Panel>
          <TableToolbar
            placeholder={`Search ${tab}`}
            dates
            exportResource={table}
            fixed={{ userId: id }}
            filters={
              tab === "ledger"
                ? [
                    {
                      key: "type",
                      label: "Type",
                      options: Object.entries(LEDGER_LABEL).map(
                        ([value, label]) => ({ value, label }),
                      ),
                    },
                  ]
                : tab === "support"
                  ? [
                      {
                        key: "status",
                        label: "Status",
                        options: ["open", "pending", "closed"].map((v) => ({
                          value: v,
                          label: v,
                        })),
                      },
                    ]
                  : [
                      {
                        key: "status",
                        label: "Status",
                        options: (tab === "withdrawals"
                          ? ["pending", "paid", "rejected"]
                          : tab === "investments"
                            ? ["active", "matured"]
                            : ["pending", "approved", "rejected"]
                        ).map((v) => ({ value: v, label: v })),
                      },
                    ]
            }
          />
          {data.rows.length === 0 ? (
            <EmptyState
              title={`No ${tab} found`}
              body="Nothing matches yet for this user."
            />
          ) : (
            <Table>
              <TableHeader>{header(tab)}</TableHeader>
              <TableBody>
                {(data.rows as Row[]).map((r) => body(tab, r))}
              </TableBody>
            </Table>
          )}
          <Pagination
            basePath={base}
            query={query as Record<string, string | undefined>}
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={data.pageSize}
          />
        </Panel>
      )}
    </>
  );
}

function header(tab: Tab) {
  const heads: Record<string, string[]> = {
    ledger: ["Date", "Type", "Detail", "Amount", "Balance"],
    deposits: ["Date", "Asset", "Amount", "Status", "Tx ref"],
    withdrawals: ["Date", "Asset", "Amount", "Status", "Tx hash"],
    investments: ["Started", "Plan", "Amount", "Profit", "Matures", "Status"],
    support: ["Opened", "Subject", "Category", "Status", "Messages"],
  };
  return (
    <TableRow>
      {heads[tab].map((h, i) => (
        <TableHead
          key={h}
          className={
            ["Amount", "Balance", "Profit"].includes(h)
              ? "text-right"
              : undefined
          }
        >
          {h}
        </TableHead>
      ))}
    </TableRow>
  );
}

function body(tab: Tab, r: Row) {
  const id = String(r._id);
  const money = (v: unknown, signed = false) => (
    <span className={signed && Number(v) >= 0 ? "text-success" : ""}>
      {signed && Number(v) >= 0 ? "+" : ""}
      {formatUsd(Number(v))}
    </span>
  );
  const right = "text-right tabular-nums";
  switch (tab) {
    case "ledger":
      return (
        <TableRow key={id}>
          <TableCell data-label="Date">
            {formatDateTime(String(r.createdAt))}
          </TableCell>
          <TableCell data-label="Type">
            {LEDGER_LABEL[String(r.type)] ?? r.type}
          </TableCell>
          <TableCell data-label="Detail" className="text-muted-foreground">
            {r.note}
          </TableCell>
          <TableCell data-label="Amount" className={right}>
            {money(r.amountCents, true)}
          </TableCell>
          <TableCell data-label="Balance" className={right}>
            {formatUsd(Number(r.balanceAfterCents))}
          </TableCell>
        </TableRow>
      );
    case "deposits":
    case "withdrawals":
      return (
        <TableRow key={id}>
          <TableCell data-label="Date">
            {formatDateTime(String(r.createdAt))}
          </TableCell>
          <TableCell data-label="Asset">
            {r.asset} · {r.network}
          </TableCell>
          <TableCell data-label="Amount" className={right}>
            {formatUsd(Number(r.amountCents))}
          </TableCell>
          <TableCell data-label="Status">
            <StatusBadge status={String(r.status)} />
          </TableCell>
          <TableCell
            data-label={tab === "deposits" ? "Tx ref" : "Tx hash"}
            className="max-w-40 truncate font-mono text-xs"
          >
            {String(tab === "deposits" ? (r.txRef ?? "") : (r.txHash ?? ""))}
          </TableCell>
        </TableRow>
      );
    case "investments":
      return (
        <TableRow key={id}>
          <TableCell data-label="Started">
            {formatDate(String(r.startedAt))}
          </TableCell>
          <TableCell data-label="Plan">
            {r.planName}
            {r.kind && r.kind !== "new" ? ` · ${r.kind}` : ""}
            {r.autoCompound ? " · auto" : ""}
          </TableCell>
          <TableCell data-label="Amount" className={right}>
            {formatUsd(Number(r.principalCents))}
          </TableCell>
          <TableCell data-label="Profit" className={right}>
            {formatUsd(Number(r.totalProfitCents))}
          </TableCell>
          <TableCell data-label="Matures">
            {formatDate(String(r.maturesAt))}
          </TableCell>
          <TableCell data-label="Status">
            <StatusBadge status={String(r.status)} />
          </TableCell>
        </TableRow>
      );
    case "support":
      return (
        <TableRow key={id}>
          <TableCell data-label="Opened">
            {formatDateTime(String(r.createdAt))}
          </TableCell>
          <TableCell data-label="Subject">
            <Link
              href={`/admin/support/${id}`}
              className="hover:text-brand font-medium underline-offset-4 hover:underline"
            >
              {r.subject}
            </Link>
          </TableCell>
          <TableCell data-label="Category" className="capitalize">
            {r.category}
          </TableCell>
          <TableCell data-label="Status">
            <StatusBadge status={String(r.status)} />
          </TableCell>
          <TableCell data-label="Messages">{r.messageCount}</TableCell>
        </TableRow>
      );
    default:
      return null;
  }
}

async function Overview({
  u,
  id,
  sessions,
  refCount,
}: {
  u: Record<string, any>;
  id: string;
  sessions: number;
  refCount: number;
}) {
  const [notes, activity, referrer] = await Promise.all([
    UserNote.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    AuditLog.find({ target: id }).sort({ createdAt: -1 }).limit(10).lean(),
    u.referredBy ? User.findById(u.referredBy).select("email").lean() : null,
  ]);
  const items: [string, React.ReactNode][] = [
    ["Joined", formatDateTime(u.createdAt)],
    ["Last login", u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"],
    ["Username", u.username ? `@${u.username}` : "None"],
    ["Active sessions", String(sessions)],
    ["Referral code", u.referralCode ?? "None"],
    [
      "Referred by",
      referrer ? (
        <Link
          key="r"
          href={`/admin/users/${u.referredBy}`}
          className="text-brand underline-offset-4 hover:underline"
        >
          {(referrer as { email: string }).email}
        </Link>
      ) : (
        "Nobody"
      ),
    ],
    ["People referred", String(refCount)],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Profile">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {items.map(([l, v]) => (
            <div key={l}>
              <dt className="text-muted-foreground">{l}</dt>
              <dd className="font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Admin notes" description="Only admins can see these.">
        <ActionForm action={addUserNoteAction}>
          <input type="hidden" name="userId" value={id} />
          <Textarea
            name="body"
            rows={3}
            placeholder="Add a note, for example about a call, a risk flag or a decision."
            maxLength={2000}
            required
          />
          <SubmitButton size="sm" pending="Saving…" className="self-start">
            Add note
          </SubmitButton>
        </ActionForm>
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No notes yet.</p>
        ) : (
          <ul className="divide-y">
            {notes.map((n) => (
              <li
                key={String(n._id)}
                className="flex items-start justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap">{n.body as string}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {n.authorEmail as string} ·{" "}
                    {formatDateTime(n.createdAt as Date)}
                  </p>
                </div>
                <ConfirmAction
                  trigger={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete note"
                    >
                      <Trash2 />
                    </Button>
                  }
                  title="Delete this note?"
                  description="This cannot be undone."
                  action={deleteUserNoteAction}
                  fields={{ id: String(n._id), userId: id }}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Recent admin activity on this user"
        className="lg:col-span-2"
      >
        {activity.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No admin actions recorded for this user.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {activity.map((a) => (
              <li
                key={String(a._id)}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span>
                  <span className="font-medium">{a.action as string}</span>{" "}
                  <span className="text-muted-foreground">
                    by {a.actorEmail as string}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(a.createdAt as Date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
