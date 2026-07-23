import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";
import { formatDateTime } from "@/lib/date";

interface PlatformTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
  organization: { id: string; name: string };
  assignedTo: { name: string } | null;
}

const STATUS_OPTIONS = ["", "OPEN", "IN_PROGRESS", "AWAITING_ORG", "RESOLVED", "CLOSED"];
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function PlatformTicketsInbox() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["platform-tickets", page, pageSize, statusFilter, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/platform/tickets", {
          params: { page, pageSize, status: statusFilter || undefined, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as { items: PlatformTicket[]; total: number; page: number; pageSize: number },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Platform Support Tickets</h1>
        <select
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="Ticket #" columnKey="ticketNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Organization" columnKey="organization" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Subject" columnKey="subject" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Category" columnKey="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Priority" columnKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3">Assigned to</th>
                <SortableTh label="Updated" columnKey="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={8}>
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={8}>
                    No tickets found.
                  </td>
                </tr>
              )}
              {data?.items.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  onClick={() => navigate(`/platform/tickets/${t.id}`)}
                >
                  <td className="p-3 font-mono text-xs">{t.ticketNumber}</td>
                  <td className="p-3 font-medium">{t.organization.name}</td>
                  <td className="p-3">{t.subject}</td>
                  <td className="p-3">{t.category}</td>
                  <td className="p-3">{t.priority}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {t.status}
                    </span>
                  </td>
                  <td className="p-3">{t.assignedTo?.name ?? "-"}</td>
                  <td className="p-3">{formatDateTime(t.updatedAt)}</td>
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
