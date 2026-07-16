import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useBranchStore } from "@/store/branch";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { formatDate } from "@/lib/date";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Product {
  id: string;
  name: string;
  sku: string;
  hasImei: boolean;
  costPrice: string;
  taxPercent: string;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
}

interface Purchase {
  id: string;
  purchaseNumber: string;
  invoiceNumber: string | null;
  purchaseDate: string;
  grandTotal: string;
  status: string;
  supplier: { name: string };
}

interface CartLine {
  productId: string;
  quantity: number;
  unitCost: number;
  taxPercent: number;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Purchases() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const [addOpen, setAddOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products", "for-purchase"],
    queryFn: async () => (await api.get("/products", { params: { pageSize: 100 } })).data as { items: Product[] },
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", "for-purchase"],
    queryFn: async () => (await api.get("/suppliers", { params: { pageSize: 100 } })).data as { items: Supplier[] },
  });
  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchases", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/purchases", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })).data as {
        items: Purchase[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = purchases ? Math.max(1, Math.ceil(purchases.total / purchases.pageSize)) : 1;

  const selection = useRowSelection(purchases?.items);

  function extractDeleteError(err: unknown): string {
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete purchase"
    );
  }

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/purchases/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/purchases/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchases"] }),
  });

  const productMap = new Map((products?.items ?? []).map((p) => [p.id, p]));

  function addLine(productId: string) {
    const product = productMap.get(productId);
    if (!product) return;
    setCart((c) => [
      ...c,
      {
        productId,
        quantity: 1,
        unitCost: Number(product.costPrice),
        taxPercent: Number(product.taxPercent),
      },
    ]);
  }

  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setCart((c) => c.filter((_, i) => i !== index));
  }

  function resetForm() {
    setCart([]);
    setSupplierId("");
    setInvoiceNumber("");
    setPurchaseDate(today());
    setError(null);
  }

  const total = cart.reduce((sum, l) => sum + l.unitCost * l.quantity * (1 + l.taxPercent / 100), 0);

  const createPurchaseMutation = useMutation({
    mutationFn: async () =>
      api.post("/purchases", {
        supplierId,
        branchId,
        invoiceNumber: invoiceNumber || undefined,
        purchaseDate: purchaseDate || undefined,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          taxPercent: l.taxPercent,
        })),
      }),
    onSuccess: () => {
      resetForm();
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create purchase";
      setError(message);
    },
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchases</h1>
        <Button onClick={() => setAddOpen(true)}>+ New purchase</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Recent purchases</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                <SortableTh label="PO #" columnKey="purchaseNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Invoice #" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Date" columnKey="purchaseDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Supplier" columnKey="supplier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Total" columnKey="grandTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              {purchases?.items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(p.id)}
                      onChange={() => selection.toggle(p.id)}
                    />
                  </td>
                  <td className="p-3">{p.purchaseNumber}</td>
                  <td className="p-3">{p.invoiceNumber ?? "-"}</td>
                  <td className="p-3">{formatDate(p.purchaseDate)}</td>
                  <td className="p-3">{p.supplier.name}</td>
                  <td className="p-3">{p.status}</td>
                  <td className="p-3">{p.grandTotal}</td>
                  <td className="p-3 flex items-center gap-2">
                    <Link to={`/purchases/${p.id}`} className="text-primary text-sm hover:underline">
                      View
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(p)}>
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
              {purchases && purchases.total > 0
                ? `${(purchases.page - 1) * purchases.pageSize + 1}-${Math.min(purchases.page * purchases.pageSize, purchases.total)} (${purchases.total})`
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
        entityLabel="purchase"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete purchase">
        {deleteTarget && (
          <DangerZone
            label="purchase"
            confirmText={deleteTarget.purchaseNumber}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={deleteMutation.isError ? extractDeleteError(deleteMutation.error) : null}
          />
        )}
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetForm();
        }}
        title="New purchase (stock-in)"
        size="xl"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Supplier</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Select supplier</option>
                {suppliers?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Invoice Number (optional)</label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Supplier's invoice #"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Purchase Date</label>
              <Input
                type="date"
                value={purchaseDate}
                max={today()}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Add product</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value=""
                onChange={(e) => e.target.value && addLine(e.target.value)}
              >
                <option value="">Select product to add</option>
                {products?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {cart.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Product</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Unit cost</th>
                  <th className="p-2">Tax %</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, i) => {
                  const product = productMap.get(line.productId);
                  return (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-2">{product?.name}</td>
                      <td className="p-2">
                        <Input
                          className="w-16"
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="w-24"
                          type="number"
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="w-20"
                          type="number"
                          step="0.01"
                          value={line.taxPercent}
                          onChange={(e) => updateLine(i, { taxPercent: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-2">
                        <Button variant="ghost" size="sm" onClick={() => removeLine(i)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {cart.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Total: {total.toFixed(2)}</p>
              <Button
                onClick={() => createPurchaseMutation.mutate()}
                disabled={!supplierId || cart.length === 0 || createPurchaseMutation.isPending}
              >
                {createPurchaseMutation.isPending ? "Receiving..." : "Confirm purchase"}
              </Button>
            </div>
          )}
          {cart.some((l) => productMap.get(l.productId)?.hasImei) && (
            <p className="text-xs text-muted-foreground">
              Note: quantity for IMEI/serial-tracked products here is a record only — it won't create stock
              automatically. Add the actual device IMEIs afterwards from the IMEI Search page (you can link them to
              this supplier there).
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
