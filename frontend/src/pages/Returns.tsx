import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface SaleItem {
  id: string;
  quantity: number;
  product: { name: string };
}

interface Sale {
  id: string;
  invoiceNumber: string;
  customer: { name: string };
  items: SaleItem[];
}

interface ReturnRecord {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  sale: { invoiceNumber: string };
  customer: { name: string; organization?: { name: string; displayName: string | null } };
  createdAt: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Returns() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [saleItemId, setSaleItemId] = useState("");
  const [type, setType] = useState<"RETURN" | "REFUND" | "REPLACEMENT">("RETURN");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReturnRecord | null>(null);

  const { data: sales } = useQuery({
    queryKey: ["sales", "for-return"],
    queryFn: async () =>
      (await api.get("/sales")).data as {
        items: { id: string; invoiceNumber: string; customer: { name: string } }[];
      },
  });

  const { data: sale } = useQuery({
    queryKey: ["sale", saleId],
    queryFn: async () => (await api.get(`/sales/${saleId}`)).data as Sale,
    enabled: !!saleId,
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/returns", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })).data as {
        items: ReturnRecord[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = returns ? Math.max(1, Math.ceil(returns.total / returns.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () => {
      const item = sale?.items.find((i) => i.id === saleItemId);
      return api.post("/returns", {
        saleId,
        type,
        reason: reason || undefined,
        items: [{ saleItemId, quantity: item?.quantity ?? 1 }],
      });
    },
    onSuccess: () => {
      setSaleId("");
      setSaleItemId("");
      setReason("");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["returns"] });
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create return"
      );
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/returns/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["returns"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/returns/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["returns"] }),
  });

  const selection = useRowSelection(returns?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/returns/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["returns"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/returns/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["returns"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Returns / Refunds / Replacements</h1>
        <Button onClick={() => setAddOpen(true)}>+ New return request</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Return requests</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Invoice" columnKey="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Type" columnKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Reason" columnKey="reason" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={isSuperAdmin ? 8 : 7}>
                    Loading...
                  </td>
                </tr>
              )}
              {returns?.items.map((r) => (
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
                      {r.customer.organization?.displayName || r.customer.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3">{r.sale.invoiceNumber}</td>
                  <td className="p-3">{r.customer.name}</td>
                  <td className="p-3">{r.type}</td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3">{r.reason ?? "-"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {r.status === "PENDING" && (
                        <>
                          <Button size="sm" onClick={() => approveMutation.mutate(r.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(r.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(r)}>
                        Delete
                      </Button>
                    </div>
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
              {returns && returns.total > 0
                ? `${(returns.page - 1) * returns.pageSize + 1}-${Math.min(returns.page * returns.pageSize, returns.total)} (${returns.total})`
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
        entityLabel="return"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete return request">
        {deleteTarget && (
          <DangerZone
            label="return request"
            confirmText={deleteTarget.reason ?? deleteTarget.id.slice(-8)}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete return"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New return request">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Sale / Invoice</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={saleId}
              onChange={(e) => {
                setSaleId(e.target.value);
                setSaleItemId("");
              }}
              required
            >
              <option value="">Select invoice</option>
              {sales?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.invoiceNumber} - {s.customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Item</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={saleItemId}
              onChange={(e) => setSaleItemId(e.target.value)}
              required
              disabled={!sale}
            >
              <option value="">Select item</option>
              {sale?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product.name} x{i.quantity}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="RETURN">Return</option>
              <option value="REFUND">Refund</option>
              <option value="REPLACEMENT">Replacement</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Reason</label>
            <input
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!saleItemId || createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit request"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
