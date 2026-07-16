import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface ActivityUser {
  id: string;
  name: string;
  email: string;
}

interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: ActivityUser | null;
}

const ACTION_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ADD", label: "Add" },
  { value: "DELETE", label: "Delete" },
] as const;

const emptyFilters = {
  action: "ALL" as "ALL" | "ADD" | "DELETE",
  entityType: "",
  userId: "",
  dateFrom: "",
  dateTo: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function ActivityReport() {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [downloading, setDownloading] = useState(false);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const queryParams = {
    page,
    pageSize,
    action: filters.action,
    entityType: filters.entityType || undefined,
    userId: filters.userId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    sortBy: sortKey ?? undefined,
    sortDir,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["activity", queryParams],
    queryFn: async () =>
      (await api.get("/activity", { params: queryParams })).data as {
        items: ActivityItem[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const { data: users } = useQuery({
    queryKey: ["users", "for-activity-filter"],
    queryFn: async () => (await api.get("/users", { params: { pageSize: 100 } })).data as { items: ActivityUser[] },
  });

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  async function downloadCsv() {
    setDownloading(true);
    try {
      const res = await api.get("/activity/export.csv", {
        params: {
          action: filters.action,
          entityType: filters.entityType || undefined,
          userId: filters.userId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "activity-report.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activity Report</h1>
        <Button size="sm" variant="outline" disabled={downloading} onClick={downloadCsv}>
          {downloading ? "Downloading..." : "Download CSV"}
        </Button>
      </div>

      <Card className="shrink-0">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={filters.action}
              onChange={(e) => updateFilter("action", e.target.value as typeof filters.action)}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Module</label>
            <Input
              placeholder="e.g. Customer, Sale"
              value={filters.entityType}
              onChange={(e) => updateFilter("entityType", e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">User</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={filters.userId}
              onChange={(e) => updateFilter("userId", e.target.value)}
            >
              <option value="">All users</option>
              {users?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter("dateFrom", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={filters.dateTo} onChange={(e) => updateFilter("dateTo", e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={() => setFilters(emptyFilters)}>
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="Date & Time" columnKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="User" columnKey="user" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Action" columnKey="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Module" columnKey="entityType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Entity ID" columnKey="entityId" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={6}>
                    No activity found for these filters.
                  </td>
                </tr>
              )}
              {data?.items.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td className="p-3">{log.user?.name ?? "System"}</td>
                  <td className="p-3">
                    <span
                      className={
                        log.action.endsWith("_DELETED")
                          ? "text-destructive font-medium"
                          : "text-primary font-medium"
                      }
                    >
                      {log.action.endsWith("_DELETED") ? "Delete" : "Add"}
                    </span>
                  </td>
                  <td className="p-3">{log.entityType}</td>
                  <td className="p-3 font-mono text-xs">{log.entityId ?? "-"}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
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
