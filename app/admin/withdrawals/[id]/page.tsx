import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  payWithdrawalAction,
  rejectWithdrawalAction,
} from "@/app/actions/admin";
import { CopyField } from "@/components/app/copy-field";
import {
  Field,
  NativeSelect,
  SubmitButton,
  TextField,
} from "@/components/app/form";
import { StepList, type TimelineStep } from "@/components/app/payment-timeline";
import { ToastForm } from "@/components/app/toast-form";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { checkAddress, coinLogo, explorerTxUrl } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { AuditLog, Kyc, Withdrawal } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Withdrawal details" };

const LABEL: Record<string, string> = {
  pending: "Under review",
  processing: "Sending",
  paid: "Paid",
  rejected: "Rejected",
};

type U = {
  _id: string;
  email: string;
  username?: string;
  balanceCents: number;
  status: string;
  createdAt: string;
};
type W = {
  _id: string;
  userId: U | null;
  reference?: string;
  asset: string;
  network: string;
  address: string;
  amountCents: number;
  status: "pending" | "processing" | "paid" | "rejected";
  provider?: string;
  providerPayoutId?: string;
  providerStatus?: string;
  cryptoAmount?: number;
  holdReason?: string;
  txHash?: string;
  reason?: string;
  createdAt: string;
  reviewedAt?: string;
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

export default async function AdminWithdrawalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  await connectDb();
  const raw = await Withdrawal.findById(id)
    .populate("userId", "email username balanceCents status createdAt")
    .lean();
  if (!raw) notFound();
  const w = plain(raw) as unknown as W;
  const user = w.userId;

  const [kyc, prior, trail] = await Promise.all([
    user
      ? Kyc.findOne({ userId: user._id }).select("status fullName").lean()
      : null,
    user
      ? Withdrawal.aggregate([
          {
            $match: {
              userId: raw.userId?._id ?? raw.userId,
              status: "paid",
            },
          },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              cents: { $sum: "$amountCents" },
            },
          },
        ])
      : [],
    AuditLog.find({ target: id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const p = (prior as { n: number; cents: number }[])[0];
  const events = plain(trail) as {
    _id: string;
    action: string;
    actorEmail?: string;
    createdAt: string;
  }[];
  const logo = coinLogo(w.asset);
  const explorer = w.txHash ? explorerTxUrl(w.network, w.txHash) : null;
  const addressWarning = checkAddress(w.network, w.address);
  const k = kyc as { status?: string; fullName?: string } | null;

  const steps: TimelineStep[] = [
    { label: "Requested", sub: formatDateTime(w.createdAt), state: "done" },
    {
      label: "Amount held",
      sub: "Taken from the user's balance",
      state: "done",
    },
    {
      label: "Reviewed",
      sub:
        w.status === "pending"
          ? "Waiting for you"
          : w.status === "processing"
            ? "Approved automatically"
            : w.reviewedAt
              ? formatDateTime(w.reviewedAt)
              : undefined,
      state:
        w.status === "pending"
          ? "current"
          : w.status === "rejected"
            ? "failed"
            : "done",
    },
    {
      label: w.status === "rejected" ? "Refunded" : "Paid out",
      state:
        w.status === "pending"
          ? "todo"
          : w.status === "processing"
            ? "current"
            : "done",
    },
  ];

  return (
    <>
      <div>
        <Link
          href="/admin/withdrawals"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All withdrawals
        </Link>
        <PageHeader
          title={w.reference ?? "Withdrawal"}
          description={`${formatUsd(w.amountCents)} in ${w.asset} on ${w.network}`}
          action={<StatusBadge status={w.status} label={LABEL[w.status]} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Payout">
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
                  {formatUsd(w.amountCents)}
                </p>
                <p className="text-muted-foreground text-sm">
                  Pay out in {w.asset} · {w.network}
                </p>
              </div>
            </div>
            <CopyField
              label={`Send to this ${w.asset} address`}
              value={w.address}
              mono
            />
            {addressWarning && (
              <p className="border-gold/50 bg-gold/10 rounded-lg border p-3 text-xs">
                {addressWarning} Check it with the user before paying.
              </p>
            )}
            <dl className="divide-y">
              <Row label="User">
                <UserLink user={user} />
              </Row>
              <Row label="Amount (USD)">{formatUsd(w.amountCents)}</Row>
              <Row label="Requested">{formatDateTime(w.createdAt)}</Row>
              {w.reviewedAt && (
                <Row label="Reviewed">{formatDateTime(w.reviewedAt)}</Row>
              )}
              {w.reason && <Row label="Reason given">{w.reason}</Row>}
            </dl>
            {w.txHash && (
              <div className="space-y-2">
                <CopyField label="Payout transaction" value={w.txHash} mono />
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
            )}
          </Panel>

          {w.status === "processing" && (
            <Panel
              title="Being sent automatically"
              description="It passed the automatic checks and the payment provider is sending it. Nothing to do unless it fails."
            >
              <dl className="divide-y">
                <Row label="Provider status">
                  <span className="capitalize">
                    {w.providerStatus ?? "processing"}
                  </span>
                </Row>
                {w.providerPayoutId && (
                  <Row label="Provider payout ID">{w.providerPayoutId}</Row>
                )}
                {w.cryptoAmount != null && (
                  <Row label="Amount sent">
                    {w.cryptoAmount} {w.asset}
                  </Row>
                )}
              </dl>
            </Panel>
          )}

          {w.status === "pending" && w.holdReason && (
            <p className="border-gold/50 bg-gold/10 rounded-lg border p-3 text-sm">
              <strong>Held for review.</strong> {w.holdReason}
            </p>
          )}

          {w.status === "pending" && (
            <Panel
              title="Review"
              description="The amount is already held. Send the payout first, then record it here."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ToastForm action={payWithdrawalAction} className="space-y-3">
                  <input type="hidden" name="id" value={w._id} />
                  <TextField
                    name="txHash"
                    label="Payout transaction hash"
                    placeholder="Paste the hash"
                    required
                    autoComplete="off"
                  />
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="confirm"
                      className="mt-0.5 size-4"
                    />
                    <span>I have sent this payout.</span>
                  </label>
                  <SubmitButton pending="Saving…">Mark as paid</SubmitButton>
                </ToastForm>
                <ToastForm
                  action={rejectWithdrawalAction}
                  className="space-y-3"
                >
                  <input type="hidden" name="id" value={w._id} />
                  <Field label="Reason" htmlFor="preset">
                    <NativeSelect
                      id="preset"
                      name="preset"
                      defaultValue="Could not verify the address"
                    >
                      <option>Could not verify the address</option>
                      <option>Identity check needed</option>
                      <option>Unusual activity</option>
                      <option>Other</option>
                    </NativeSelect>
                  </Field>
                  <TextField
                    name="reason"
                    label="Note to the user (optional)"
                    placeholder="Add detail"
                  />
                  <SubmitButton variant="outline" pending="Rejecting…">
                    Reject and refund
                  </SubmitButton>
                </ToastForm>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Progress">
            <StepList steps={steps} />
          </Panel>
          <Panel title="About this user">
            {user ? (
              <dl className="divide-y">
                <Row label="Email">
                  <UserLink user={user} />
                </Row>
                {user.username && <Row label="Username">@{user.username}</Row>}
                {k?.fullName && <Row label="Verified name">{k.fullName}</Row>}
                <Row label="Balance now">{formatUsd(user.balanceCents)}</Row>
                <Row label="Account">
                  <StatusBadge status={user.status} />
                </Row>
                <Row label="Identity check">
                  <StatusBadge status={k?.status ?? "none"} />
                </Row>
                <Row label="Past payouts">
                  {p?.n ?? 0} paid · {formatUsd(p?.cents ?? 0)}
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
