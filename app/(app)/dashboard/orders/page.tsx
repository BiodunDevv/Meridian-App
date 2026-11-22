import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MobileDetails } from "@/components/app/mobile-details";
import { Pagination } from "@/components/app/pagination";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { orderLabel } from "@/lib/order-status";
import { expireStaleOrders } from "@/lib/services/orders";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Orders" };
const PAGE = 20;

type Row = {
  _id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  createdAt: string;
  snapshot?: { productName?: string; optionLabel?: string };
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  await connectDb();
  await expireStaleOrders(user.id);
  const [rows, total] = await Promise.all([
    Order.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE)
      .limit(PAGE)
      .lean(),
    Order.countDocuments({ userId: user.id }),
  ]);
  const data = plain(rows) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Everything you have bought, with its payment and status."
        action={
          <Button asChild>
            <Link href="/dashboard/shop">
              <ShoppingBag /> Shop
            </Link>
          </Button>
        }
      />
      <Panel>
        {data.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            body="Choose airtime, data, electricity or cable TV and pay with crypto."
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/shop">Start shopping</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o._id}>
                  <TableCell data-label="Order">
                    <span className="block font-mono text-xs">{o.number}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(o.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell data-label="Item">
                    {o.snapshot?.productName}
                    <span className="text-muted-foreground block text-xs">
                      {o.snapshot?.optionLabel}
                    </span>
                  </TableCell>
                  <TableCell
                    data-label="Price"
                    className="text-right tabular-nums"
                  >
                    {formatMinor(o.amountMinor, o.currency)}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge
                      status={o.status}
                      label={orderLabel(o.status)}
                    />
                  </TableCell>
                  <MobileDetails href={`/dashboard/orders/${o._id}`} desktop />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/dashboard/orders"
          query={{}}
          page={page}
          pages={Math.max(1, Math.ceil(total / PAGE))}
          total={total}
          pageSize={PAGE}
        />
      </Panel>
    </>
  );
}
