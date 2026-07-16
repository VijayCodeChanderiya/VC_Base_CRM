import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { QrCode } from "@/components/ui/qrcode";
import { useBranchStore } from "@/store/branch";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Product {
  id: string;
  sku: string;
  name: string;
  hasImei: boolean;
  unitPrice: string;
  costPrice: string;
  taxPercent: string;
  hsnCode: string | null;
  inventory: { quantity: number }[];
}

const emptyForm = {
  sku: "",
  name: "",
  hasImei: false,
  unitPrice: "",
  costPrice: "",
  taxPercent: "0",
  hsnCode: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Products() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const [search, setSearch] = useState("");
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, branchId, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/products", {
          params: { search, branchId, page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Product[];
        total: number;
        page: number;
        pageSize: number;
      },
    enabled: !!branchId,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function closeModal() {
    setAddOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  function openEdit(p: Product) {
    setForm({
      sku: p.sku,
      name: p.name,
      hasImei: p.hasImei,
      unitPrice: p.unitPrice,
      costPrice: p.costPrice,
      taxPercent: p.taxPercent,
      hsnCode: p.hsnCode ?? "",
    });
    setEditTarget(p);
  }

  const payload = () => ({
    sku: form.sku,
    name: form.name,
    hasImei: form.hasImei,
    unitPrice: Number(form.unitPrice),
    costPrice: Number(form.costPrice),
    taxPercent: Number(form.taxPercent),
    hsnCode: form.hsnCode || undefined,
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post("/products", { ...payload(), branchId }),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/products/${editTarget!.id}`, payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/products/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  function extractError(err: unknown): string {
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete product"
    );
  }

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  const isEditing = !!editTarget;
  const activeMutation = isEditing ? updateMutation : createMutation;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Product Catalog</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add product</Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs mb-3 shrink-0"
        />
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <SortableTh label="SKU" columnKey="sku" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Name" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="HSN" columnKey="hsnCode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh
                    label="Tracking"
                    columnKey="tracking"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh label="Stock" columnKey="stock" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh
                    label="Unit price"
                    columnKey="unitPrice"
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
                    <td className="p-3" colSpan={8}>
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.items.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td className="p-3">{p.sku}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.hsnCode ?? "-"}</td>
                    <td className="p-3">{p.hasImei ? "IMEI" : "Quantity"}</td>
                    <td className="p-3">{p.hasImei ? "-" : p.inventory[0]?.quantity ?? 0}</td>
                    <td className="p-3">{p.unitPrice}</td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setQrProduct(p)}>
                        QR
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
          entityLabel="product"
          onClear={clear}
          isDeleting={false}
          onConfirmDelete={async () => {
            const res = await api.post("/products/bulk-delete", { ids: Array.from(selectedIds) });
            clear();
            queryClient.invalidateQueries({ queryKey: ["products"] });
            return res.data;
          }}
        />
      </div>

      <Modal open={!!qrProduct} onClose={() => setQrProduct(null)} title={qrProduct?.name ?? ""}>
        {qrProduct && (
          <div className="flex flex-col items-center gap-2">
            <QrCode value={qrProduct.sku} size={160} />
            <p className="text-xs text-muted-foreground font-mono">{qrProduct.sku}</p>
          </div>
        )}
      </Modal>

      <Modal open={addOpen || isEditing} onClose={closeModal} title={isEditing ? "Edit product" : "Add product"} size="lg">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            activeMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">SKU</label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Unit price</label>
            <Input
              type="number"
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cost price</label>
            <Input
              type="number"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tax %</label>
            <Input
              type="number"
              step="0.01"
              value={form.taxPercent}
              onChange={(e) => setForm({ ...form, taxPercent: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">HSN code</label>
            <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hasImei}
              onChange={(e) => setForm({ ...form, hasImei: e.target.checked })}
            />
            Track by IMEI / Serial
          </label>
          <Button type="submit" disabled={activeMutation.isPending} className="col-span-2">
            {activeMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add product"}
          </Button>
          {isEditing && editTarget && (
            <DangerZone
              label="product"
              confirmText={editTarget.sku}
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
