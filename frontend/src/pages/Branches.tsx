import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

const emptyForm = { code: "", name: "", address: "" };

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Branches() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["branches", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/branches", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })
      ).data as {
        items: Branch[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function closeModal() {
    setAddOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
    setError(null);
  }

  function openEdit(b: Branch) {
    setForm({ code: b.code, name: b.name, address: b.address ?? "" });
    setEditTarget(b);
  }

  const createMutation = useMutation({
    mutationFn: async () => api.post("/branches", form),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create branch");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/branches/${editTarget!.id}`, { name: form.name, address: form.address }),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to update branch");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/branches/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/branches/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });

  function extractError(err: unknown): string {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete branch";
  }

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  const isEditing = !!editTarget;
  const activeMutation = isEditing ? updateMutation : createMutation;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Branches</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add branch</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>All branches</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <SortableTh label="Code" columnKey="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Name" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh
                  label="Address"
                  columnKey="address"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Status"
                  columnKey="isActive"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <th className="p-3"></th>
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
              {data?.items.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggle(b.id)} />
                  </td>
                  <td className="p-3 font-mono">{b.code}</td>
                  <td className="p-3">{b.name}</td>
                  <td className="p-3">{b.address ?? "-"}</td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant={b.isActive ? "outline" : "default"}
                      disabled={b.code === "MAIN"}
                      onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.isActive })}
                    >
                      {b.isActive ? "Active" : "Inactive"}
                    </Button>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                      Edit
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
        count={selectedIds.size}
        entityLabel="branch"
        onClear={clear}
        isDeleting={false}
        onConfirmDelete={async () => {
          const res = await api.post("/branches/bulk-delete", { ids: Array.from(selectedIds) });
          clear();
          queryClient.invalidateQueries({ queryKey: ["branches"] });
          return res.data;
        }}
      />

      <Modal open={addOpen || isEditing} onClose={closeModal} title={isEditing ? "Edit branch" : "Add branch"}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            activeMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Code</label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. NORTH"
              disabled={isEditing}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Address</label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={activeMutation.isPending}>
            {activeMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add branch"}
          </Button>
          {isEditing && editTarget && (
            <DangerZone
              label="branch"
              confirmText={editTarget.code}
              onDelete={() => deleteMutation.mutate()}
              isDeleting={deleteMutation.isPending}
              error={deleteMutation.isError ? extractError(deleteMutation.error) : null}
            />
          )}
        </form>
      </Modal>
    </div>
  );
}
