import type { Metadata } from "next";

import { reviewKycAction, setUserStatusAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/app/form";
import { IconInput } from "@/components/app/icon-input";
import { KycDocuments } from "@/components/app/kyc-documents";
import { MobileDetails } from "@/components/app/mobile-details";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import { ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  paramsToQuery,
  parseParams,
  queryResource,
} from "@/lib/admin/resources";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Kyc } from "@/lib/models";
import { formatDate, formatUsd } from "@/lib/money";
import { fullIdNumber } from "@/lib/services/kyc";
import { audit } from "@/lib/services/notify";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Users" };

type U = {
  _id: string;
  email: string;
  username?: string;
  role: string;
  createdAt: string;
  emailVerifiedAt?: string;
  balanceCents: number;
  status: string;
  emailSuppressed?: { reason?: string };
};

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = parseParams(await searchParams);
  await connectDb();
  const [{ rows, total, page, pages, pageSize }, kycs] = await Promise.all([
    queryResource("users", params),
    Kyc.find({ status: "pending" }).populate("userId", "email").lean(),
  ]);
  const users = rows as U[];
  const statusByUser = new Map(
    plain(
      await Kyc.find({ userId: { $in: users.map((u) => u._id) } })
        .select("userId status")
        .lean(),
    ).map((k: { userId: string; status: string }) => [
      String(k.userId),
      k.status,
    ]),
  );
  const pending = (
    kycs as unknown as {
      _id: string;
      userId: { _id: string; email: string } | null;
      fullName: string;
      dateOfBirth: string;
      country: string;
      address: string;
      idType: string;
      idNumberEnc?: string;
      documents?: { kind: string }[];
    }[]
  ).map((k) => ({ ...plain(k), idMasked: fullIdNumber(k.idNumberEnc) }));
  // Showing a full ID number is sensitive, so every view is recorded in the audit log.
  await Promise.all(
    pending.map((k) => audit(admin, "kyc.view_id", String(k._id))),
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Search everyone, open a profile for the full picture, and review identity submissions."
      />

      {pending.length > 0 && (
        <Panel title={`Identity checks waiting (${pending.length})`}>
          <div className="space-y-3">
            {pending.map((k) => (
              <div
                key={k._id}
                className="space-y-3 rounded-lg border p-3 text-sm"
              >
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Email: </span>
                    <UserLink user={k.userId} />
                  </p>
                  <p>
                    <span className="text-muted-foreground">Name: </span>
                    {k.fullName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Born: </span>
                    {k.dateOfBirth}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Country: </span>
                    {k.country}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">Address: </span>
                    {k.address}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{k.idType}: </span>
                    {k.idMasked}
                  </p>
                </div>
                {k.userId && (
                  <KycDocuments userId={k.userId._id} documents={k.documents} />
                )}
                <div className="flex flex-wrap gap-2">
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
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="All users">
        <TableToolbar
          placeholder="Search email, username or name"
          dates
          exportResource="users"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
              ],
            },
            {
              key: "role",
              label: "Role",
              options: [
                { value: "investor", label: "Customer" },
                { value: "admin", label: "Admin" },
              ],
            },
            {
              key: "verified",
              label: "Email",
              options: [
                { value: "yes", label: "Verified" },
                { value: "no", label: "Not verified" },
              ],
            },
            {
              key: "kyc",
              label: "KYC",
              options: [
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "rejected", label: "Rejected" },
                { value: "none", label: "None" },
              ],
            },
          ]}
        />
        {users.length === 0 ? (
          <EmptyState
            title="No users match"
            body="Try a different search or clear the filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id}>
                  <TableCell data-label="User">
                    <UserLink user={u} />
                    {u.username && (
                      <span className="text-muted-foreground block text-xs">
                        @{u.username}
                      </span>
                    )}
                    {u.role === "admin" && (
                      <span className="text-gold-foreground text-xs">
                        Admin
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-label="Joined">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell data-label="Verified">
                    {u.emailVerifiedAt ? "Yes" : "No"}
                    {u.emailSuppressed?.reason && (
                      <span className="text-destructive-foreground block text-xs">
                        Email {u.emailSuppressed.reason.replace("_", " ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-label="KYC">
                    <StatusBadge status={statusByUser.get(u._id) ?? "none"} />
                  </TableCell>
                  <TableCell
                    data-label="Balance"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(u.balanceCents)}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <MobileDetails href={`/admin/users/${u._id}`} desktop />
                  <TableCell data-label="">
                    {u._id !== admin.id && (
                      <ToastForm action={setUserStatusAction}>
                        <input type="hidden" name="id" value={u._id} />
                        <input
                          type="hidden"
                          name="status"
                          value={u.status === "active" ? "suspended" : "active"}
                        />
                        <SubmitButton size="sm" variant="outline">
                          {u.status === "active" ? "Suspend" : "Reactivate"}
                        </SubmitButton>
                      </ToastForm>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/users"
          query={paramsToQuery(params)}
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
        />
      </Panel>
    </>
  );
}
