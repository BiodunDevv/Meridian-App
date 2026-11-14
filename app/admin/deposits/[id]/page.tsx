import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { approveDepositAction, rejectDepositAction } from "@/app/actions/admin";
import { CopyField } from "@/components/app/copy-field";
import {
  Field,
  NativeSelect,
  SubmitButton,
  TextField,
} from "@/components/app/form";
import { PaymentTimeline } from "@/components/app/payment-timeline";
import { ToastForm } from "@/components/app/toast-form";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { coinLogo, explorerTxUrl } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { depositLabel } from "@/lib/deposit-status";
import { formatCrypto } from "@/lib/format-crypto";
import { AuditLog, Deposit, Kyc } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Deposit details" };

type U = {
  _id: string;
  email: string;
  username?: string;
  balanceCents: number;
  status: string;
  createdAt: string;
};
type D = {
  _id: string;
  userId: U | null;
  asset: string;
  network: string;
  address?: string;
  memo?: string;
  amountCents: number;
  creditedCents?: number;
  cryptoAmount?: number;
  rate?: number;
  txRef?: string;
  reference?: string;
  provider?: string;
  providerPaymentId?: string;
  providerStatus?: string;
  status: string;
  reason?: string;
  createdAt: string;
  expiresAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}

export default async function DepositDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  await connectDb();
  const raw = await Deposit.findById(id)
    .populate("userId", "email username balanceCents status createdAt")
    .lean();
  if (!raw) notFound();
  const d = plain(raw) as unknown as D;
  const user = d.userId;

  const [kyc, prior, trail] = await Promise.all([
    user ? Kyc.findOne({ userId: user._id }).select("status").lean() : null,
    user
      ? Deposit.aggregate([
          {
            $match: {
              userId: raw.userId?._id ?? raw.userId,
              status: "approved",
            },
          },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              cents: { $sum: { $ifNull: ["$creditedCents", "$amountCents"] } },
            },
          },
        ])
      : [],
    AuditLog.find({ target: id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const priorN = (prior as { n: number; cents: number }[])[0]?.n ?? 0;
  const priorCents = (prior as { n: number; cents: number }[])[0]?.cents ?? 0;
  const events = plain(trail) as {
    _id: string;
    action: string;
    actorEmail?: string;
    createdAt: string;
  }[];
  const logo = coinLogo(d.asset);
  const explorer = d.txRef ? explorerTxUrl(d.network, d.txRef) : null;
  // Online payments are confirmed by the provider. A person only steps in for an underpaid one.
  const reviewable =
    d.status === "pending" &&
    (!d.provider || d.providerStatus === "partially_paid");

  return (
    <>
      <div>
        <Link
          href="/admin/deposits"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All deposits
        </Link>
        <PageHeader
          title={d.reference ?? "Deposit"}
          description={`${formatUsd(d.amountCents)} via ${d.asset} on ${d.network}`}
          action={
            <StatusBadge
              status={d.status}
              label={depositLabel(d.status, d.provider)}
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Payment">
            <div className="flex items-center gap-3">
              {logo && (
                <Image
                  src={logo}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10"
                  unoptimized
                />
              )}
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatUsd(d.amountCents)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {d.cryptoAmount
                    ? `Expected ${formatCrypto(d.asset, d.cryptoAmount)}`
                    : d.asset}{" "}
                  · {d.network}
                </p>
              </div>
            </div>
            <dl className="divide-y">
              <Row label="Reference">{d.reference ?? "None"}</Row>
              <Row label="User">
                <UserLink user={user} />
              </Row>
              <Row label="Requested">{formatUsd(d.amountCents)}</Row>
              {d.creditedCents != null && (
                <Row label="Credited">{formatUsd(d.creditedCents)}</Row>
              )}
              {d.rate ? (
                <Row label="Rate locked">
                  {formatUsd(Math.round(d.rate * 100))} per {d.asset}
                </Row>
              ) : null}
              <Row label="Created">{formatDateTime(d.createdAt)}</Row>
              {d.expiresAt && (
                <Row label="Payment window ends">
                  {formatDateTime(d.expiresAt)}
                </Row>
              )}
              {d.submittedAt && (
                <Row label="Marked as paid">
                  {formatDateTime(d.submittedAt)}
                </Row>
              )}
              {d.reviewedAt && (
                <Row label="Reviewed">{formatDateTime(d.reviewedAt)}</Row>
              )}
              {d.reason && <Row label="Note to user">{d.reason}</Row>}
            </dl>
          </Panel>

          <Panel
            title="Where it was sent"
            description="Check the transaction on the chain before approving."
          >
            {d.address ? (
              <CopyField label="Deposit address" value={d.address} mono />
            ) : null}
            {d.memo ? (
              <CopyField label="Memo / tag" value={d.memo} mono />
            ) : null}
            {d.txRef ? (
              <div className="space-y-2">
                <CopyField
                  label="Transaction reference from the user"
                  value={d.txRef}
                  mono
                />
                {explorer && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on block explorer{" "}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                The user has not submitted a transaction reference yet.
              </p>
            )}
          </Panel>

          {d.provider && (
            <Panel
              title="Online payment"
              description="Confirmed automatically by the payment provider. The balance is credited as soon as the network confirms it."
            >
              <dl className="divide-y">
                <Row label="Provider">NOWPayments</Row>
                <Row label="Provider status">
                  <span className="capitalize">
                    {(d.providerStatus ?? "waiting").replace(/_/g, " ")}
                  </span>
                </Row>
                {d.providerPaymentId && (
                  <Row label="Provider payment ID">{d.providerPaymentId}</Row>
                )}
              </dl>
              {d.providerStatus === "partially_paid" && (
                <p className="border-gold/50 bg-gold/10 rounded-lg border p-3 text-xs">
                  Less than the requested amount arrived. Credit what actually
                  arrived below, or reject it.
                </p>
              )}
              {d.status === "pending" &&
                d.providerStatus !== "partially_paid" && (
                  <p className="text-muted-foreground text-xs">
                    Funds were seen on the network and are being confirmed.
                    Nothing to do here.
                  </p>
                )}
            </Panel>
          )}

          {reviewable && (
            <Panel
              title="Review"
              description="Approve only after the funds have arrived in your wallet."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ToastForm action={approveDepositAction} className="space-y-3">
                  <input type="hidden" name="id" value={d._id} />
                  <TextField
                    name="credit"
                    label="Amount to credit (USD)"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={(d.amountCents / 100).toFixed(2)}
                    hint="Change this only if a different amount arrived."
                  />
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="confirm"
                      className="mt-0.5 size-4"
                    />
                    <span>I have seen the funds arrive.</span>
                  </label>
                  <SubmitButton pending="Approving…">
                    Approve and credit
                  </SubmitButton>
                </ToastForm>
                <ToastForm action={rejectDepositAction} className="space-y-3">
                  <input type="hidden" name="id" value={d._id} />
                  <Field label="Reason" htmlFor="preset">
                    <NativeSelect
                      id="preset"
                      name="preset"
                      defaultValue="Funds not received"
                    >
                      <option>Funds not received</option>
                      <option>Wrong network</option>
                      <option>Amount does not match</option>
                      <option>Transaction not found</option>
                      <option>Other</option>
                    </NativeSelect>
                  </Field>
                  <TextField
                    name="reason"
                    label="Note to the user (optional)"
                    placeholder="Add detail"
                  />
                  <SubmitButton variant="outline" pending="Rejecting…">
                    Reject
                  </SubmitButton>
                </ToastForm>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Progress">
            <PaymentTimeline
              status={d.status as never}
              createdAt={d.createdAt}
              submittedAt={d.submittedAt}
              reviewedAt={d.reviewedAt}
            />
          </Panel>
          <Panel title="About this user">
            {user ? (
              <dl className="divide-y">
                <Row label="Email">
                  <UserLink user={user} />
                </Row>
                {user.username && <Row label="Username">@{user.username}</Row>}
                <Row label="Balance">{formatUsd(user.balanceCents)}</Row>
                <Row label="Account">
                  <StatusBadge status={user.status} />
                </Row>
                <Row label="Identity check">
                  <StatusBadge
                    status={
                      (kyc as { status?: string } | null)?.status ?? "none"
                    }
                  />
                </Row>
                <Row label="Past deposits">
                  {priorN} credited · {formatUsd(priorCents)}
                </Row>
                <Row label="Joined">{formatDateTime(user.createdAt)}</Row>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                This account no longer exists.
              </p>
            )}
          </Panel>
          {events.length > 0 && (
            <Panel title="Activity">
              <ul className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e._id} className="flex justify-between gap-3">
                    <span>
                      {e.action.replace(/[._]/g, " ")}
                      {e.actorEmail ? ` · ${e.actorEmail}` : ""}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
