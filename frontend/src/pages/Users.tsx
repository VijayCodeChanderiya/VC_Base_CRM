import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { isValidEmail, EMAIL_ERROR } from "@/lib/validators";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const ROLES = ["ADMIN", "STAFF", "COMPANY", "RESELLER"] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Users() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["users", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/users", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })
      ).data as {
        items: AppUser[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () => api.post("/users", form),
    onSuccess: () => {
      setForm({ name: "", email: "", password: "", role: "STAFF" });
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create user");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AppUser> }) => api.patch(`/users/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/users/${editTarget!.id}`),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function extractError(err: unknown): string {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete user";
  }

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">User Management</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add user</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <SortableTh label="Name" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Email" columnKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Role" columnKey="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh
                  label="Active"
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
              {data?.items.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggle(u.id)} />
                  </td>
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <select
                      className="h-8 rounded-md border border-border bg-card px-2 text-sm"
                      value={u.role}
                      onChange={(e) => updateMutation.mutate({ id: u.id, patch: { role: e.target.value } })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant={u.isActive ? "outline" : "default"}
                      onClick={() => updateMutation.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </Button>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setEditTarget(u)}>
                      Manage
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
        entityLabel="user"
        onClear={clear}
        isDeleting={false}
        onConfirmDelete={async () => {
          const res = await api.post("/users/bulk-delete", { ids: Array.from(selectedIds) });
          clear();
          queryClient.invalidateQueries({ queryKey: ["users"] });
          return res.data;
        }}
      />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Manage user">
        {editTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {editTarget.name} ({editTarget.email})
            </p>
            <DangerZone
              label="user"
              confirmText={editTarget.email}
              onDelete={() => deleteMutation.mutate()}
              isDeleting={deleteMutation.isPending}
              error={deleteMutation.isError ? extractError(deleteMutation.error) : null}
            />
          </div>
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add user">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidEmail(form.email)) {
              setError(EMAIL_ERROR);
              return;
            }
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Email *</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Role</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Add user"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
