import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
import { formatDate } from "@/lib/date";

interface Customer {
  id: string;
  name: string;
  phone: string;
  organization?: { name: string; displayName: string | null };
}

interface Vehicle {
  id: string;
  registrationNumber: string;
}

type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
type AmcStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "CANCELLED";

interface AmcContract {
  id: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  status: AmcStatus;
  billingAmount: string;
  billingCycle: BillingCycle;
  customer: Customer;
  vehicle: Vehicle | null;
}

const BILLING_CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "YEARLY", label: "Yearly" },
];

const STATUS_TONE: Record<AmcStatus, string> = {
  ACTIVE: "bg-primary/10 text-primary",
  EXPIRING_SOON: "bg-warning/15 text-warning",
  EXPIRED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  customerId: "",
  vehicleId: "",
  startDate: today(),
  endDate: "",
  billingAmount: "",
  billingCycle: "YEARLY" as BillingCycle,
};

export function Amc() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AmcContract | null>(null);
  const [renewTarget, setRenewTarget] = useState<AmcContract | null>(null);
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewAmount, setRenewAmount] = useState("");

  const { data: customers } = useQuery({
    queryKey: ["customers", "for-amc"],
    queryFn: async () => (await api.get("/customers", { params: { pageSize: 200 } })).data as { items: Customer[] },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", "for-amc"],
    queryFn: async () => (await api.get("/vehicles", { params: { pageSize: 200 } })).data as { items: Vehicle[] },
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["amc", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/amc", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } })).data as {
        items: AmcContract[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/amc", {
        customerId: form.customerId,
        vehicleId: form.vehicleId || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        billingAmount: Number(form.billingAmount),
        billingCycle: form.billingCycle,
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["amc"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create contract");
    },
  });

  const renewMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/amc/${renewTarget!.id}/renew`, {
        newEndDate: renewEndDate,
        billingAmount: renewAmount ? Number(renewAmount) : undefined,
      }),
    onSuccess: () => {
      setRenewTarget(null);
      setRenewEndDate("");
      setRenewAmount("");
      queryClient.invalidateQueries({ queryKey: ["amc"] });
    },
  });

  const selection = useRowSelection(data?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/amc/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["amc"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/amc/bulk-delete", { ids })).data as { deleted: string[]; failed: { id: string; reason: string }[] },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["amc"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">AMC Contracts</h1>
        <Button onClick={() => setAddOpen(true)}>+ New contract</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Contracts</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                {isSuperAdmin && <th className="p-3">Organization</th>}
                <SortableTh label="Contract #" columnKey="contractNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3">Vehicle</th>
                <th className="p-3">Billing</th>
                <SortableTh label="Valid Until" columnKey="endDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              {data?.items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input type="checkbox" checked={selection.selectedIds.has(c.id)} onChange={() => selection.toggle(c.id)} />
                  </td>
                  {isSuperAdmin && (
                    <td className="p-3 text-muted-foreground">
                      {c.customer.organization?.displayName || c.customer.organization?.name || "-"}
                    </td>
                  )}
                  <td className="p-3 font-mono text-xs">{c.contractNumber}</td>
                  <td className="p-3">
                    {c.customer.name}
                    <span className="ml-1 text-xs text-muted-foreground">({c.customer.phone})</span>
                  </td>
                  <td className="p-3">{c.vehicle?.registrationNumber ?? "-"}</td>
                  <td className="p-3">
                    ₹{Number(c.billingAmount).toLocaleString()} / {BILLING_CYCLE_OPTIONS.find((b) => b.value === c.billingCycle)?.label}
                  </td>
                  <td className="p-3">{formatDate(c.endDate)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="p-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRenewTarget(c);
                        setRenewEndDate(c.endDate.slice(0, 10));
                        setRenewAmount(c.billingAmount);
                      }}
                    >
                      Renew
                    </Button>
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
        count={selection.selectedIds.size}
        entityLabel="AMC contract"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete AMC contract">
        {deleteTarget && (
          <DangerZone
            label="AMC contract"
            confirmText={deleteTarget.contractNumber}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete contract"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={!!renewTarget} onClose={() => setRenewTarget(null)} title={`Renew ${renewTarget?.contractNumber ?? ""}`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">New valid-until date</label>
            <Input type="date" value={renewEndDate} onChange={(e) => setRenewEndDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Billing amount</label>
            <Input type="number" value={renewAmount} onChange={(e) => setRenewAmount(e.target.value)} />
          </div>
          <Button disabled={!renewEndDate || renewMutation.isPending} onClick={() => renewMutation.mutate()}>
            {renewMutation.isPending ? "Renewing..." : "Renew contract"}
          </Button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New AMC contract">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Customer</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
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
            <label className="text-xs text-muted-foreground">Vehicle (optional)</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
            >
              <option value="">None</option>
              {vehicles?.items.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Start date</label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Valid until</label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Billing amount</label>
              <Input
                type="number"
                value={form.billingAmount}
                onChange={(e) => setForm({ ...form, billingAmount: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Billing cycle</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={form.billingCycle}
                onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle })}
              >
                {BILLING_CYCLE_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!form.customerId || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Create contract"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
