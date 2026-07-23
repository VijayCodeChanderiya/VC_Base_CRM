import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { QrCode } from "@/components/ui/qrcode";
import { useBranchStore } from "@/store/branch";
import { useAuthStore } from "@/store/auth";
import { isValidImei, IMEI_ERROR } from "@/lib/validators";
import { formatDate } from "@/lib/date";
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
}

interface Supplier {
  id: string;
  name: string;
}

interface ImeiRecord {
  id: string;
  imei: string;
  status: string;
  product: { name: string; sku: string };
  createdAt: string;
  receivedDate: string;
  supplier: { name: string } | null;
  purchaseItem: { purchase: { supplier: { name: string } } } | null;
  saleItem: { sale: { customer: { name: string } } } | null;
  branch?: { organization?: { name: string; displayName: string | null } };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface BulkImeiResult {
  created: string[];
  failed: { imei: string; reason: string }[];
}

function parseBulkImeis(raw: string): { unique: string[]; duplicates: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const unique: string[] = [];
  for (const token of tokens) {
    if (!isValidImei(token)) {
      invalid.push(token);
    } else if (seen.has(token)) {
      duplicates.push(token);
    } else {
      seen.add(token);
      unique.push(token);
    }
  }
  return { unique, duplicates, invalid };
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Imei() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [bulkText, setBulkText] = useState("");
  const [search, setSearch] = useState("");
  const [qrImei, setQrImei] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ImeiRecord | null>(null);
  const [editImei, setEditImei] = useState("");
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkImeiResult | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products", "imei-tracked"],
    queryFn: async () => (await api.get("/products", { params: { pageSize: 100 } })).data as { items: Product[] },
  });
  const imeiProducts = products?.items.filter((p) => p.hasImei) ?? [];

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", "for-imei"],
    queryFn: async () => (await api.get("/suppliers", { params: { pageSize: 200 } })).data as { items: Supplier[] },
  });

  const { unique: parsedImeis, duplicates: bulkDuplicates, invalid: bulkInvalid } = parseBulkImeis(bulkText);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: imeis, isLoading } = useQuery({
    queryKey: ["imei-list", search, branchId, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/imei", {
          params: { search, branchId, page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: ImeiRecord[];
        total: number;
        page: number;
        pageSize: number;
      },
    enabled: isSuperAdmin || !!branchId,
  });

  const totalPages = imeis ? Math.max(1, Math.ceil(imeis.total / imeis.pageSize)) : 1;

  const addImeiMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/imei", {
          productId,
          branchId,
          supplierId: supplierId || undefined,
          receivedDate: receivedDate || undefined,
          imeis: parsedImeis,
        })
      ).data as BulkImeiResult,
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkText("");
      queryClient.invalidateQueries({ queryKey: ["imei-list"] });
      if (result.failed.length === 0) {
        setAddOpen(false);
        setSupplierId("");
        setReceivedDate(today());
      }
    },
  });

  const editImeiMutation = useMutation({
    mutationFn: async () => api.patch(`/imei/record/${editTarget!.id}`, { imei: editImei }),
    onSuccess: () => {
      setEditTarget(null);
      setEditImei("");
      queryClient.invalidateQueries({ queryKey: ["imei-list"] });
    },
  });

  const selection = useRowSelection(imeis?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/imei/record/${editTarget!.id}`),
    onSuccess: () => {
      setEditTarget(null);
      setEditImei("");
      queryClient.invalidateQueries({ queryKey: ["imei-list"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/imei/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imei-list"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">IMEI / Serial Tracking</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add IMEI</Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <Input
          placeholder="Search IMEI..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs shrink-0"
        />
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                  </th>
                  {isSuperAdmin && <th className="p-3">Organization</th>}
                  <SortableTh label="IMEI" columnKey="imei" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Product" columnKey="product" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Vendor" columnKey="vendor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Received" columnKey="receivedDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                {imeis?.items.map((r) => (
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
                    <td className="p-3 font-mono">{r.imei}</td>
                    <td className="p-3">{r.product.name}</td>
                    <td className="p-3">{r.purchaseItem?.purchase.supplier.name ?? r.supplier?.name ?? "-"}</td>
                    <td className="p-3">{formatDate(r.receivedDate)}</td>
                    <td className="p-3">{r.saleItem?.sale.customer.name ?? "-"}</td>
                    <td className="p-3">{r.status}</td>
                    <td className="p-3 flex gap-2">
                      <Link to={`/imei/${r.imei}/timeline`} className="text-primary text-sm hover:underline self-center">
                        Timeline
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditTarget(r);
                          setEditImei(r.imei);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setQrImei(r.imei)}>
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
                {imeis && imeis.total > 0
                  ? `${(imeis.page - 1) * imeis.pageSize + 1}-${Math.min(imeis.page * imeis.pageSize, imeis.total)} (${imeis.total})`
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
          entityLabel="IMEI"
          onClear={selection.clear}
          isDeleting={bulkDeleteMutation.isPending}
          onConfirmDelete={async () => {
            const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
            selection.clear();
            return res;
          }}
        />
      </div>

      <Modal open={!!qrImei} onClose={() => setQrImei(null)} title="IMEI">
        {qrImei && (
          <div className="flex flex-col items-center gap-2">
            <QrCode value={qrImei} size={160} />
            <p className="text-xs text-muted-foreground font-mono">{qrImei}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit IMEI">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidImei(editImei)) {
              setEditFormError(IMEI_ERROR);
              return;
            }
            setEditFormError(null);
            editImeiMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">IMEI / Serial * (15 digits)</label>
            <Input
              value={editImei}
              onChange={(e) => setEditImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
              inputMode="numeric"
              maxLength={15}
              required
            />
          </div>
          {editFormError && <p className="text-sm text-destructive">{editFormError}</p>}
          {editImeiMutation.isError && (
            <p className="text-sm text-destructive">
              {(editImeiMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                "Failed to update IMEI"}
            </p>
          )}
          <Button type="submit" disabled={editImeiMutation.isPending}>
            {editImeiMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </form>
        {editTarget && (
          <DangerZone
            label="IMEI record"
            confirmText={editTarget.imei}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete IMEI"
                : null
            }
          />
        )}
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setBulkText("");
          setSupplierId("");
          setReceivedDate(today());
          setAddFormError(null);
          setBulkResult(null);
        }}
        title="Add IMEI to stock"
        size="lg"
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (bulkInvalid.length > 0) {
              setAddFormError(`${bulkInvalid.length} entr${bulkInvalid.length === 1 ? "y" : "ies"} not 15 digits — fix or remove before adding`);
              return;
            }
            if (parsedImeis.length === 0) {
              setAddFormError("Add at least one IMEI / serial number");
              return;
            }
            setAddFormError(null);
            setBulkResult(null);
            addImeiMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Product *</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
              >
                <option value="">Select product</option>
                {imeiProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Supplier (optional)</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">None</option>
                {suppliers?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Date Received</label>
              <Input
                type="date"
                value={receivedDate}
                max={today()}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Change this if the stock physically arrived earlier than today (e.g. paperwork came in late).
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              IMEI / Serial * (15 digits each — scan one per line, or paste from Excel/email: one per line or
              comma-separated)
            </label>
            <textarea
              className="h-40 w-full rounded-md border border-border bg-card p-3 text-sm font-mono"
              placeholder={"356938035643809\n356938035643810\n356938035643811"}
              value={bulkText}
              onChange={(e) => {
                setBulkText(e.target.value);
                setAddFormError(null);
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {parsedImeis.length} valid IMEI(s) detected
              {bulkDuplicates.length > 0 ? `, ${bulkDuplicates.length} duplicate(s) ignored` : ""}
            </p>
          </div>
          {bulkInvalid.length > 0 && (
            <p className="text-sm text-destructive">
              Not 15 digits, please fix: {bulkInvalid.join(", ")}
            </p>
          )}
          {addFormError && <p className="text-sm text-destructive">{addFormError}</p>}
          {addImeiMutation.isError && (
            <p className="text-sm text-destructive">
              {(addImeiMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                "Failed to add IMEI"}
            </p>
          )}
          {bulkResult && (
            <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              <p>{bulkResult.created.length} added successfully.</p>
              {bulkResult.failed.length > 0 && (
                <>
                  <p className="text-destructive">{bulkResult.failed.length} could not be added:</p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {bulkResult.failed.map((f) => (
                      <li key={f.imei}>
                        {f.imei}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <Button type="submit" disabled={addImeiMutation.isPending}>
            {addImeiMutation.isPending
              ? "Saving..."
              : parsedImeis.length > 1
                ? `Add ${parsedImeis.length} IMEIs`
                : "Add"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
