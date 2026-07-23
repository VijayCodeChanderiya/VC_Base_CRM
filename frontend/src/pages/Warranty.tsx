import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { isValidImei, IMEI_ERROR } from "@/lib/validators";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface WarrantyClaim {
  id: string;
  status: string;
  description: string | null;
  claimDate: string;
  customer: { name: string; organization?: { name: string; displayName: string | null } };
  imeiRecord: { imei: string; product: { name: string } } | null;
}

const STATUS_OPTIONS = ["ACTIVE", "EXPIRED", "CLAIMED", "VOID"] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Warranty() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [imei, setImei] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarrantyClaim | null>(null);

  const { data: customers } = useQuery({
    queryKey: ["customers", "for-warranty"],
    queryFn: async () => (await api.get("/customers", { params: { pageSize: 100 } })).data as { items: Customer[] },
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: claims, isLoading } = useQuery({
    queryKey: ["warranty-claims", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/warranty", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })).data as {
        items: WarrantyClaim[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = claims ? Math.max(1, Math.ceil(claims.total / claims.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () => {
      let imeiRecordId: string | undefined;
      if (imei) {
        const found = await api.get(`/imei/${imei}`);
        imeiRecordId = found.data.id;
      }
      return api.post("/warranty", { customerId, imeiRecordId, description: description || undefined });
    },
    onSuccess: () => {
      setCustomerId("");
      setImei("");
      setDescription("");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create claim"
      );
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/warranty/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warranty-claims"] }),
  });

  const selection = useRowSelection(claims?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/warranty/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/warranty/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warranty-claims"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Warranty Management</h1>
        <Button onClick={() => setAddOpen(true)}>+ New claim</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Claims</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Product / IMEI" columnKey="product" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Description" columnKey="description" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={isSuperAdmin ? 7 : 6}>
                    Loading...
                  </td>
                </tr>
              )}
              {claims?.items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(c.id)}
                      onChange={() => selection.toggle(c.id)}
                    />
                  </td>
                  {isSuperAdmin && (
                    <td className="p-3 text-muted-foreground">
                      {c.customer.organization?.displayName || c.customer.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3">{c.customer.name}</td>
                  <td className="p-3">
                    {c.imeiRecord ? `${c.imeiRecord.product.name} (${c.imeiRecord.imei})` : "-"}
                  </td>
                  <td className="p-3">{c.description ?? "-"}</td>
                  <td className="p-3">
                    <select
                      className="h-8 rounded-md border border-border bg-card px-2 text-sm"
                      value={c.status}
                      onChange={(e) => updateStatusMutation.mutate({ id: c.id, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(c)}>
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
              {claims && claims.total > 0
                ? `${(claims.page - 1) * claims.pageSize + 1}-${Math.min(claims.page * claims.pageSize, claims.total)} (${claims.total})`
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
        entityLabel="warranty claim"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete warranty claim">
        {deleteTarget && (
          <DangerZone
            label="warranty claim"
            confirmText={deleteTarget.customer.name}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete claim"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New warranty claim">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (imei && !isValidImei(imei)) {
              setError(IMEI_ERROR);
              return;
            }
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Customer</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Select customer</option>
              {customers?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">IMEI (optional, 15 digits)</label>
            <Input
              value={imei}
              onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
              inputMode="numeric"
              maxLength={15}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Issue description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!customerId || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Log claim"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
