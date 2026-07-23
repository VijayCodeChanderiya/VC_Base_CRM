import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";
import { formatDate } from "@/lib/date";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "ALERT";
  isActive: boolean;
  publishedAt: string;
  expiresAt: string | null;
  organization?: { name: string; displayName: string | null };
}

const TYPE_OPTIONS = ["INFO", "WARNING", "ALERT"] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100];

export function Announcements() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]>("INFO");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["announcements", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/announcements", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } }))
        .data as { items: Announcement[]; total: number; page: number; pageSize: number },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/announcements", { title, message, type, expiresAt: expiresAt || undefined }),
    onSuccess: () => {
      setTitle("");
      setMessage("");
      setType("INFO");
      setExpiresAt("");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to create announcement"
      );
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/announcements/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });

  const selection = useRowSelection(data?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/announcements/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/announcements/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Announcements</h1>
        <Button onClick={() => setAddOpen(true)}>+ New announcement</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Broadcasts to customers</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Title" columnKey="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3">Message</th>
                <th className="p-3">Type</th>
                <SortableTh
                  label="Published"
                  columnKey="publishedAt"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <th className="p-3">Expires</th>
                <SortableTh label="Active" columnKey="isActive" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={isSuperAdmin ? 9 : 8}>
                    Loading...
                  </td>
                </tr>
              )}
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(a.id)}
                      onChange={() => selection.toggle(a.id)}
                    />
                  </td>
                  {isSuperAdmin && (
                    <td className="p-3 text-muted-foreground">
                      {a.organization?.displayName || a.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3 font-medium">{a.title}</td>
                  <td className="p-3 max-w-xs truncate" title={a.message}>
                    {a.message}
                  </td>
                  <td className="p-3">{a.type}</td>
                  <td className="p-3">{formatDate(a.publishedAt)}</td>
                  <td className="p-3">{a.expiresAt ? formatDate(a.expiresAt) : "-"}</td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={a.isActive}
                      onChange={(e) => toggleActiveMutation.mutate({ id: a.id, isActive: e.target.checked })}
                    />
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(a)}>
                      Delete
                    </Button>
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

      <BulkActionBar
        count={selection.selectedIds.size}
        entityLabel="announcement"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete announcement">
        {deleteTarget && (
          <DangerZone
            label="announcement"
            confirmText={deleteTarget.title}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete announcement"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New announcement">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Message</label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as (typeof TYPE_OPTIONS)[number])}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Expires on (optional)</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!title || !message || createMutation.isPending}>
            {createMutation.isPending ? "Publishing..." : "Publish"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
