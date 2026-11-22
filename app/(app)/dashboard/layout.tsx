import { AppShell } from "@/components/app/app-shell";
import { MfaPrompt } from "@/components/app/mfa-prompt";
import { SetupNotice } from "@/components/app/setup-notice";
import { UsernamePrompt } from "@/components/app/username-prompt";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { isDbConfigured } from "@/lib/env";
import { Notification, Ticket } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDbConfigured()) return <SetupNotice />;
  const user = await requireUser();
  await connectDb();
  const supportUnread = await Ticket.countDocuments({
    userId: user.id,
    unreadByUser: true,
  });
  const unread = await Notification.countDocuments({
    userId: user.id,
    readAt: { $exists: false },
  });
  return (
    <AppShell
      user={user}
      variant="customer"
      unread={unread}
      badges={{
        "/dashboard/notifications": unread,
        "/dashboard/support": supportUnread,
      }}
      installAllowed={user.usernameChosen && !user.mfaPromptDue}
    >
      {user.emailBlocked && (
        <div
          role="alert"
          className="border-destructive-foreground/40 bg-destructive-foreground/5 rounded-xl border px-4 py-3 text-sm"
        >
          We could not deliver email to <strong>{user.email}</strong>, so you
          will not receive confirmations or payout notices by email. Contact
          support to update your address. In-app notifications still work.
        </div>
      )}
      {children}
      <UsernamePrompt username={user.username} due={!user.usernameChosen} />
      <MfaPrompt due={user.mfaPromptDue && user.usernameChosen} />
    </AppShell>
  );
}
