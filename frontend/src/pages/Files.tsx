import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const ENTITY_TYPES = ["Customer", "Product", "Sale", "Purchase", "Return", "WarrantyClaim", "Supplier"] as const;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Files() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<string>("Customer");
  const [entityId, setEntityId] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterEntityId, setFilterEntityId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["files", filterEntityType, filterEntityId, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/files", {
          params: {
            entityType: filterEntityType || undefined,
            entityId: filterEntityId || undefined,
            page,
            pageSize,
            sortBy: sortKey ?? undefined,
            sortDir,
          },
        })
      ).data as { items: FileRecord[]; total: number; page: number; pageSize: number },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", entityType);
      if (entityId) form.append("entityId", entityId);
      return api.post("/files", form);
    },
    onSuccess: () => {
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });

  async function download(file: FileRecord) {
    const res = await api.get(`/files/${file.id}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="shrink-0 text-xl font-semibold">File Manager</h1>

      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Upload file</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Attach to</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Entity ID (optional)</label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-64" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">File</label>
              <input
                ref={fileInputRef}
                type="file"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                }}
              />
            </div>
            {uploadMutation.isPending && <p className="text-sm text-muted-foreground">Uploading...</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 flex gap-3 mb-3">
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={filterEntityType}
            onChange={(e) => {
              setFilterEntityType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Input
            placeholder="Filter by entity ID..."
            value={filterEntityId}
            onChange={(e) => {
              setFilterEntityId(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
                <tr>
                  <SortableTh label="Filename" columnKey="filename" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Attached to" columnKey="entityType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Size" columnKey="size" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Uploaded" columnKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="p-3" colSpan={5}>
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.items.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="p-3">{f.filename}</td>
                    <td className="p-3">
                      {f.entityType ?? "-"}
                      {f.entityId ? ` #${f.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="p-3">{formatSize(f.size)}</td>
                    <td className="p-3">{formatDateTime(f.createdAt)}</td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => download(f)}>
                        Download
                      </Button>
                      {user?.role === "ADMIN" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (window.confirm(`Delete "${f.filename}"? This cannot be undone.`)) {
                              deleteMutation.mutate(f.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
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
    </div>
  );
}
