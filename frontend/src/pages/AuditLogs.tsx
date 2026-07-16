import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function AuditLogs() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/audit-logs", {
          params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: AuditLog[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex h-full flex-col gap-6">
      <h1 className="shrink-0 text-xl font-semibold">Audit Logs</h1>
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="Time" columnKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="User" columnKey="user" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Action" columnKey="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Entity" columnKey="entity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={4}>
                    Loading...
                  </td>
                </tr>
              )}
              {data?.items.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="p-3">{formatDateTime(log.createdAt)}</td>
                  <td className="p-3">{log.user?.name ?? "System"}</td>
                  <td className="p-3">{log.action}</td>
                  <td className="p-3">
                    {log.entityType}
                    {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <select
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {data && data.total > 0
                ? `${(data.page - 1) * data.pageSize + 1}-${Math.min(data.page * data.pageSize, data.total)} (${data.total})`
                : "0-0 (0)"}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
