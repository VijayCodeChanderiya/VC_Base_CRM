import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ImeiPickerModal } from "@/components/sales/ImeiPickerModal";
import { useBranchStore } from "@/store/branch";
import { useAuthStore } from "@/store/auth";
import { Link } from "react-router-dom";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Product {
  id: string;
  name: string;
  sku: string;
  hasImei: boolean;
  unitPrice: string;
  taxPercent: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Sale {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  status: string;
  createdAt: string;
  customer: { name: string };
  branch?: { organization?: { name: string; displayName: string | null } };
}

interface CartLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  imeis: string[];
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

interface SaleBulkResult {
  totalRecords: number;
  created: string[];
  failed: { reference: string; rows: number[]; reason: string }[];
}

export function Sales() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkFormError, setBulkFormError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<SaleBulkResult | null>(null);
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [gstType, setGstType] = useState<"INTRA_STATE" | "INTER_STATE">("INTRA_STATE");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickerLineIndex, setPickerLineIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: products } = useQuery({
    queryKey: ["products", "for-sale"],
    queryFn: async () => (await api.get("/products", { params: { pageSize: 100 } })).data as { items: Product[] },
  });
  const { data: customers } = useQuery({
    queryKey: ["customers", "for-sale"],
    queryFn: async () => (await api.get("/customers", { params: { pageSize: 100 } })).data as { items: Customer[] },
  });
  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/sales", {
          params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Sale[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = sales ? Math.max(1, Math.ceil(sales.total / sales.pageSize)) : 1;

  const selection = useRowSelection(sales?.items);

  function extractError(err: unknown): string {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete sale";
  }

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/sales/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/sales/bulk-delete", { ids })).data as { deleted: string[]; failed: { id: string; reason: string }[] },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  });

  const productMap = new Map((products?.items ?? []).map((p) => [p.id, p]));

  function addLine(productId: string) {
    const product = productMap.get(productId);
    if (!product) return;
    setCart((c) => [
      ...c,
      {
        productId,
        quantity: product.hasImei ? 0 : 1,
        unitPrice: Number(product.unitPrice),
        taxPercent: Number(product.taxPercent),
        imeis: [],
      },
    ]);
    if (product.hasImei) {
      setPickerLineIndex(cart.length);
    }
  }

  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function setQuantity(index: number, quantity: number) {
    setCart((c) => c.map((line, i) => (i === index ? { ...line, quantity: Math.max(1, quantity) } : line)));
  }

  function applyImeiSelection(imeis: string[]) {
    if (pickerLineIndex === null) return;
    updateLine(pickerLineIndex, { imeis, quantity: imeis.length });
  }

  function removeLine(index: number) {
    setCart((c) => c.filter((_, i) => i !== index));
  }

  function resetForm() {
    setCart([]);
    setCustomerId("");
    setGstType("INTRA_STATE");
    setPlaceOfSupply("");
    setError(null);
  }

  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity * (1 + l.taxPercent / 100), 0);

  const createSaleMutation = useMutation({
    mutationFn: async () =>
      api.post("/sales", {
        customerId,
        branchId,
        gstType,
        placeOfSupply: placeOfSupply || undefined,
        items: cart.flatMap((l) => {
          const product = productMap.get(l.productId);
          if (product?.hasImei) {
            // One IMEI-tracked device is one sale item — expand the line into one entry per unit.
            return l.imeis.map((imei) => ({
              productId: l.productId,
              quantity: 1,
              unitPrice: l.unitPrice,
              taxPercent: l.taxPercent,
              imei,
            }));
          }
          return [
            {
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxPercent: l.taxPercent,
            },
          ];
        }),
      }),
    onSuccess: () => {
      resetForm();
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["imei-list"] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create sale";
      setError(message);
    },
  });

  function closeBulkModal() {
    setBulkOpen(false);
    setBulkFile(null);
    setBulkResult(null);
    setBulkFormError(null);
  }

  async function downloadSaleTemplate(sample: boolean) {
    setTemplateDownloading(true);
    try {
      const res = await api.get("/sales/bulk/template", {
        params: sample ? { sample: 1 } : undefined,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = sample ? "Sales sample file.xlsx" : "Sales bulk upload template.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setTemplateDownloading(false);
    }
  }

  const bulkUploadMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", bulkFile!);
      return (await api.post("/sales/bulk/upload", form)).data as SaleBulkResult;
    },
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkFile(null);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: unknown) => {
      setBulkFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to upload sales"
      );
    },
  });

  const pickerLine = pickerLineIndex !== null ? cart[pickerLineIndex] : null;
  const pickerProduct = pickerLine ? productMap.get(pickerLine.productId) : undefined;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales & Invoices</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            Bulk Upload
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ New sale</Button>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Invoice #" columnKey="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Total" columnKey="grandTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              {sales?.items.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(s.id)}
                      onChange={() => selection.toggle(s.id)}
                    />
                  </td>
                  {isSuperAdmin && (
                    <td className="p-3 text-muted-foreground">
                      {s.branch?.organization?.displayName || s.branch?.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3">{s.invoiceNumber}</td>
                  <td className="p-3">{s.customer.name}</td>
                  <td className="p-3">{s.status}</td>
                  <td className="p-3">{s.grandTotal}</td>
                  <td className="p-3 flex items-center gap-2">
                    <Link to={`/sales/${s.id}/invoice`} className="text-primary text-sm hover:underline">
                      View invoice
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(s)}>
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
              {sales && sales.total > 0
                ? `${(sales.page - 1) * sales.pageSize + 1}-${Math.min(sales.page * sales.pageSize, sales.total)} (${sales.total})`
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
        entityLabel="sale"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete sale">
        {deleteTarget && (
          <DangerZone
            label="sale"
            confirmText={deleteTarget.invoiceNumber}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={deleteMutation.isError ? extractError(deleteMutation.error) : null}
          />
        )}
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetForm();
        }}
        title="New sale"
        size="xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Customer</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
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
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">GST type</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={gstType}
                onChange={(e) => setGstType(e.target.value as typeof gstType)}
              >
                <option value="INTRA_STATE">Intra-state (CGST+SGST)</option>
                <option value="INTER_STATE">Inter-state (IGST)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Place of supply</label>
              <Input
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                className="w-40"
                placeholder="e.g. Karnataka"
              />
            </div>
          </div>

          {cart.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Product</th>
                  <th className="p-2">Qty / IMEIs</th>
                  <th className="p-2">Unit price</th>
                  <th className="p-2">Tax %</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, i) => {
                  const product = productMap.get(line.productId);
                  return (
                    <tr key={i} className="border-b border-border last:border-0 align-top">
                      <td className="p-2">{product?.name}</td>
                      <td className="p-2">
                        {product?.hasImei ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setPickerLineIndex(i)}>
                              {line.imeis.length > 0 ? `${line.imeis.length} device(s) selected` : "Select IMEIs"}
                            </Button>
                          </div>
                        ) : (
                          <Input
                            className="w-20"
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => setQuantity(i, Number(e.target.value))}
                          />
                        )}
                      </td>
                      <td className="p-2">
                        <Input
                          className="w-24"
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
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
                onClick={() => createSaleMutation.mutate()}
                disabled={
                  !customerId ||
                  cart.length === 0 ||
                  cart.some((l) => productMap.get(l.productId)?.hasImei && l.imeis.length === 0) ||
                  createSaleMutation.isPending
                }
              >
                {createSaleMutation.isPending ? "Placing order..." : "Confirm sale"}
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </Modal>

      <Modal open={bulkOpen} onClose={closeBulkModal} title="Bulk Upload Sales" size="lg">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Each row is one product line, using the same fields as the "New sale" cart. Give every invoice a unique
            "Invoice Ref" — rows sharing the same ref become one sale with multiple items. Rows with errors are
            reported individually so you can fix and re-upload just those.
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-muted-foreground">Excel file (.xlsx)</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={templateDownloading}
                onClick={() => downloadSaleTemplate(false)}
              >
                {templateDownloading ? "Downloading..." : "Download template"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={templateDownloading}
                onClick={() => downloadSaleTemplate(true)}
              >
                Download sample file
              </Button>
            </div>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBulkFormError(null);
              setBulkResult(null);
              if (!bulkFile) {
                setBulkFormError("Choose an Excel file to upload");
                return;
              }
              bulkUploadMutation.mutate();
            }}
          >
            <input
              type="file"
              accept=".xlsx"
              className="text-sm"
              onChange={(e) => {
                setBulkFile(e.target.files?.[0] ?? null);
                setBulkFormError(null);
              }}
            />
            {bulkFile && <p className="text-xs text-muted-foreground">Selected: {bulkFile.name}</p>}
            {bulkFormError && <p className="text-sm text-destructive">{bulkFormError}</p>}
            {bulkResult && (
              <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <p>Total invoices processed: {bulkResult.totalRecords}</p>
                <p className="text-emerald-600">Successfully imported: {bulkResult.created.length}</p>
                {bulkResult.failed.length > 0 && (
                  <>
                    <p className="text-destructive">Failed: {bulkResult.failed.length}</p>
                    <ul className="max-h-48 list-disc overflow-y-auto pl-4 text-xs text-muted-foreground">
                      {bulkResult.failed.map((f, i) => (
                        <li key={i} className="text-destructive">
                          {f.reference} (row{f.rows.length > 1 ? "s" : ""} {f.rows.join(", ")}): {f.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <Button type="submit" disabled={bulkUploadMutation.isPending}>
              {bulkUploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </div>
      </Modal>

      <ImeiPickerModal
        open={pickerLineIndex !== null}
        onClose={() => setPickerLineIndex(null)}
        productId={pickerLine?.productId ?? null}
        productName={pickerProduct?.name}
        branchId={branchId}
        initialSelected={pickerLine?.imeis ?? []}
        onConfirm={applyImeiSelection}
      />
    </div>
  );
}
