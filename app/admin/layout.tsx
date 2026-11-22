import { AppShell } from "@/components/app/app-shell";
import { SetupNotice } from "@/components/app/setup-notice";
import { requireStaff } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { isDbConfigured } from "@/lib/env";
import { Deposit, Kyc, Ticket, Withdrawal } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDbConfigured()) return <SetupNotice />;
  const user = await requireStaff();
  await connectDb();
  const [dep, wd, kyc, support] = await Promise.all([
    Deposit.countDocuments({ status: "pending" }),
    Withdrawal.countDocuments({ status: "pending" }),
    Kyc.countDocuments({ status: "pending" }),
    Ticket.countDocuments({ unreadByAdmin: true }),
  ]);
  return (
    <AppShell
      user={user}
      variant="admin"
      badges={{
        "/admin/deposits": dep,
        "/admin/withdrawals": wd,
        "/admin/users": kyc,
      }}
    >
      {children}
    </AppShell>
  );
}
