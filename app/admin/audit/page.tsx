import type { Metadata } from "next";

import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
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
import { formatDateTime } from "@/lib/money";

export const metadata: Metadata = { title: "Audit log" };

type Row = {
  _id: string;
  createdAt: string;
  actorEmail?: string;
  action: string;
  target?: string;
};

const GROUPS = [
  "deposit",
  "withdrawal",
  "kyc",
  "user",
  "asset",
  "network",
  "wallet",
  "message",
  "support",
  "export",
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = parseParams(await searchParams);
  const { rows, total, page, pages, pageSize } = await queryResource(
    "audit",
    params,
  );
  const data = rows as Row[];
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every admin action on money, users and settings."
      />
      <Panel>
        <TableToolbar
          placeholder="Search admin, action or target"
          dates
          exportResource="audit"
          filters={[
            {
              key: "type",
              label: "Area",
              options: GROUPS.map((g) => ({ value: g, label: g })),
            },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Approvals, settings changes and wallet changes are logged here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a._id}>
                  <TableCell data-label="When">
                    {formatDateTime(a.createdAt)}
                  </TableCell>
                  <TableCell data-label="Admin">{a.actorEmail}</TableCell>
                  <TableCell data-label="Action" className="font-medium">
                    {a.action}
                  </TableCell>
                  <TableCell
                    data-label="Target"
                    className="max-w-48 truncate font-mono text-xs"
                  >
                    {a.target}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/audit"
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
