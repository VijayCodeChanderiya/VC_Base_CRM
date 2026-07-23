import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBranchStore } from "@/store/branch";
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

interface ImeiRecord {
  id: string;
  imei: string;
  status: string;
  product: { name: string };
}

interface Supplier {
  id: string;
  name: string;
}

interface RmaRecord {
  id: string;
  status: string;
  reason: string;
  imeiRecord: { imei: string; product: { name: string } };
  supplier: { name: string };
  branch?: { organization?: { name: string; displayName: string | null } };
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Rma() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [imeiRecordId, setImeiRecordId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RmaRecord | null>(null);

  const { data: imeis } = useQuery({
    queryKey: ["imei-list", "for-rma", branchId],
    queryFn: async () =>
      (await api.get("/imei", { params: { branchId, pageSize: 100 } })).data as { items: ImeiRecord[] },
    enabled: !!branchId,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", "for-rma"],
    queryFn: async () => (await api.get("/suppliers", { params: { pageSize: 100 } })).data as { items: Supplier[] },
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: rmas, isLoading } = useQuery({
    queryKey: ["rma", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/rma", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })).data as {
        items: RmaRecord[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = rmas ? Math.max(1, Math.ceil(rmas.total / rmas.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () => api.post("/rma", { imeiRecordId, supplierId, reason, branchId }),
    onSuccess: () => {
      setImeiRecordId("");
      setSupplierId("");
      setReason("");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["rma"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create RMA");
    },
  });

  const shipMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/rma/${id}/ship`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rma"] }),
  });
  const receiveMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/rma/${id}/receive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rma"] }),
  });
  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/rma/${id}/resolve`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rma"] }),
  });

  const selection = useRowSelection(rmas?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/rma/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["rma"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/rma/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rma"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">RMA Workflow</h1>
          <p className="text-sm text-muted-foreground">
            Return defective units to a supplier/manufacturer. Distinct from customer-facing Returns.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Open RMA</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>RMA cases</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Device" columnKey="device" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Supplier" columnKey="supplier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Reason" columnKey="reason" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              {rmas?.items.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(r.id)}
                      onChange={() => selection.toggle(r.id)}
                    />
                  </td>
                  {isSuperAdmin && (
                    <td className="p-3 text-muted-foreground">
                      {r.branch?.organization?.displayName || r.branch?.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3 font-mono">
                    {r.imeiRecord.imei} ({r.imeiRecord.product.name})
                  </td>
                  <td className="p-3">{r.supplier.name}</td>
                  <td className="p-3">{r.reason}</td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(r)}>
                      Delete
                    </Button>
                    {r.status === "REQUESTED" && (
                      <Button size="sm" variant="outline" onClick={() => shipMutation.mutate(r.id)}>
                        Mark shipped
                      </Button>
                    )}
                    {r.status === "SHIPPED_TO_SUPPLIER" && (
                      <Button size="sm" variant="outline" onClick={() => receiveMutation.mutate(r.id)}>
                        Mark received
                      </Button>
                    )}
                    {(r.status === "SHIPPED_TO_SUPPLIER" || r.status === "RECEIVED_BY_SUPPLIER") && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => resolveMutation.mutate({ id: r.id, status: "REPLACED" })}
                        >
                          Replaced
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveMutation.mutate({ id: r.id, status: "REPAIRED" })}
                        >
                          Repaired
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => resolveMutation.mutate({ id: r.id, status: "REJECTED" })}
                        >
                          Rejected
                        </Button>
                      </>
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
              {rmas && rmas.total > 0
                ? `${(rmas.page - 1) * rmas.pageSize + 1}-${Math.min(rmas.page * rmas.pageSize, rmas.total)} (${rmas.total})`
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
        entityLabel="RMA"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete RMA">
        {deleteTarget && (
          <DangerZone
            label="RMA"
            confirmText={deleteTarget.imeiRecord.imei}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete RMA"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Open RMA">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Device (IMEI)</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={imeiRecordId}
              onChange={(e) => setImeiRecordId(e.target.value)}
              required
            >
              <option value="">Select device</option>
              {imeis?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.imei} ({i.product.name}) - {i.status}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Supplier</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              <option value="">Select supplier</option>
              {suppliers?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Opening..." : "Open RMA"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
