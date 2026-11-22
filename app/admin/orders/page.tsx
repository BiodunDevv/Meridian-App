import type { Metadata } from "next";

import { MobileDetails } from "@/components/app/mobile-details";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
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
import { requireStaff } from "@/lib/auth/guards";
import { ORDER_STATUSES } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { ORDER_LABEL } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders" };

type Row = {
  _id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  createdAt: string;
  userId?: { _id: string; email: string; username?: string };
  snapshot?: { productName?: string; optionLabel?: string };
};

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("orders.view");
  const params = parseParams(await searchParams);
  const { rows, total, page, pages, pageSize } = await queryResource(
    "orders",
    params,
  );
  const data = rows as Row[];
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order and its payment. Fulfilment actions (retry, refund, mark delivered) arrive with the fulfilment engine."
      />
      <Panel>
        <TableToolbar
          placeholder="Search order number, item, customer or payment id"
          dates
          exportResource="orders"
          filters={[
            {
              key: "status",
              label: "Status",
              options: ORDER_STATUSES.map((v) => ({
                value: v,
                label: ORDER_LABEL[v] ?? v,
              })),
            },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState
            title="No orders match"
            body="Orders appear here as soon as a customer starts one."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
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
                  <TableCell data-label="Customer">
                    <UserLink user={o.userId} />
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
                      label={ORDER_LABEL[o.status] ?? o.status}
                    />
                  </TableCell>
                  <MobileDetails href={`/admin/orders/${o._id}`} desktop />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/orders"
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
