import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBranchStore } from "@/store/branch";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { isValidIccid, isValidM2mNumber, ICCID_ERROR, M2M_NUMBER_ERROR } from "@/lib/validators";
import { formatDate } from "@/lib/date";
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

interface ImeiRecord {
  id: string;
  imei: string;
  product: { name: string };
}

type Carrier = "JIO" | "AIRTEL" | "VI" | "BSNL" | "OTHER";
type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

interface Sim {
  id: string;
  iccid: string;
  msisdn: string | null;
  carrier: Carrier;
  billingCycle: BillingCycle | null;
  status: string;
  purchaseDate: string;
  saleDate: string | null;
  customer: Customer | null;
  imeiRecord: ImeiRecord | null;
  branch?: { organization?: { name: string; displayName: string | null } };
}

interface BulkSimResult {
  created: string[];
  failed: { iccid: string; reason: string }[];
}

const CARRIER_OPTIONS: { value: Carrier; label: string }[] = [
  { value: "JIO", label: "Jio" },
  { value: "AIRTEL", label: "Airtel" },
  { value: "VI", label: "VI (Vodafone Idea)" },
  { value: "BSNL", label: "BSNL" },
  { value: "OTHER", label: "Other" },
];
const BILLING_CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "YEARLY", label: "Yearly" },
];
const emptyForm = {
  iccid: "",
  msisdn: "",
  carrier: "JIO" as Carrier,
  customerId: "",
  saleDate: today(),
  billingCycle: "MONTHLY" as BillingCycle,
};
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface BulkSimEntry {
  iccid: string;
  msisdn: string;
}

function parseBulkSims(raw: string): {
  valid: BulkSimEntry[];
  invalidLines: string[];
  duplicateIccids: string[];
} {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: BulkSimEntry[] = [];
  const invalidLines: string[] = [];
  const duplicateIccids: string[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const iccid = (parts[0] ?? "").toUpperCase();
    const msisdn = parts[1] ?? "";
    if (!isValidIccid(iccid) || (msisdn && !isValidM2mNumber(msisdn))) {
      invalidLines.push(line);
      continue;
    }
    if (seen.has(iccid)) {
      duplicateIccids.push(iccid);
      continue;
    }
    seen.add(iccid);
    valid.push({ iccid, msisdn });
  }
  return { valid, invalidLines, duplicateIccids };
}

export function Sims() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const branchId = useBranchStore((s) => s.branchId);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [search, setSearch] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Sim | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [assignTarget, setAssignTarget] = useState<Sim | null>(null);
  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [assignImeiId, setAssignImeiId] = useState("");
  const [assignSaleDate, setAssignSaleDate] = useState(today());
  const [assignBillingCycle, setAssignBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [clientSearch, setClientSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"paste" | "excel">("paste");
  const [bulkCarrier, setBulkCarrier] = useState<Carrier>("JIO");
  const [bulkDate, setBulkDate] = useState(today());
  const [bulkText, setBulkText] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSimResult | null>(null);
  const [bulkFormError, setBulkFormError] = useState<string | null>(null);
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignCustomerId, setBulkAssignCustomerId] = useState("");
  const [bulkAssignSaleDate, setBulkAssignSaleDate] = useState(today());
  const [bulkAssignBillingCycle, setBulkAssignBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [bulkAssignResult, setBulkAssignResult] = useState<{
    assigned: string[];
    failed: { id: string; reason: string }[];
  } | null>(null);

  const [dashboardOpen, setDashboardOpen] = useState(false);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["sims", search, carrierFilter, branchId, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/sims", {
          params: {
            search,
            carrier: carrierFilter || undefined,
            branchId,
            page,
            pageSize,
            sortBy: sortKey ?? undefined,
            sortDir,
          },
        })
      ).data as {
        items: Sim[];
        total: number;
        page: number;
        pageSize: number;
      },
    enabled: isSuperAdmin || !!branchId,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const { data: stats } = useQuery({
    queryKey: ["sims", "stats", branchId],
    queryFn: async () =>
      (await api.get("/sims/stats", { params: { branchId } })).data as {
        total: number;
        assigned: number;
        available: number;
      },
    enabled: isSuperAdmin || !!branchId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers", "for-sim"],
    queryFn: async () => (await api.get("/customers", { params: { pageSize: 500 } })).data as { items: Customer[] },
  });

  const filteredCustomers = useMemo(() => {
    const items = customers?.items ?? [];
    if (!clientSearch.trim()) return items;
    const q = clientSearch.trim().toLowerCase();
    return items.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, clientSearch]);

  const { data: imeis } = useQuery({
    queryKey: ["imei-list", "for-sim", branchId],
    queryFn: async () =>
      (await api.get("/imei", { params: { status: "SOLD", branchId, pageSize: 100 } })).data as {
        items: ImeiRecord[];
      },
    enabled: !!branchId,
  });

  const { valid: bulkValid, invalidLines: bulkInvalid, duplicateIccids: bulkDuplicates } = parseBulkSims(bulkText);

  function closeModal() {
    setAddOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
    setFormError(null);
    setClientSearch("");
  }

  function openEdit(s: Sim) {
    setForm({
      iccid: s.iccid,
      msisdn: s.msisdn ?? "",
      carrier: s.carrier,
      customerId: s.customer?.id ?? "",
      saleDate: s.saleDate ? s.saleDate.slice(0, 10) : today(),
      billingCycle: s.billingCycle ?? "MONTHLY",
    });
    setEditTarget(s);
    setClientSearch("");
  }

  function closeBulkModal() {
    setBulkOpen(false);
    setBulkMode("paste");
    setBulkCarrier("JIO");
    setBulkDate(today());
    setBulkText("");
    setBulkFile(null);
    setBulkResult(null);
    setBulkFormError(null);
    setShowGuide(false);
  }

  async function downloadTemplate() {
    setTemplateDownloading(true);
    try {
      const res = await api.get("/sims/bulk/template", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Bulk upload file.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setTemplateDownloading(false);
    }
  }

  function closeAssignModal() {
    setAssignTarget(null);
    setAssignCustomerId("");
    setAssignImeiId("");
    setAssignSaleDate(today());
    setAssignBillingCycle("MONTHLY");
    setClientSearch("");
  }

  function closeBulkAssignModal() {
    setBulkAssignOpen(false);
    setBulkAssignCustomerId("");
    setBulkAssignSaleDate(today());
    setBulkAssignBillingCycle("MONTHLY");
    setBulkAssignResult(null);
    setClientSearch("");
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/sims", { iccid: form.iccid, msisdn: form.msisdn, carrier: form.carrier, branchId }),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["sims"] });
    },
    onError: (err: unknown) => {
      setFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save SIM"
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/sims/${editTarget!.id}`, {
        iccid: form.iccid,
        msisdn: form.msisdn,
        carrier: form.carrier,
        customerId: form.customerId || null,
        saleDate: form.customerId ? form.saleDate || undefined : undefined,
        billingCycle: form.customerId ? form.billingCycle : undefined,
      }),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["sims"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: unknown) => {
      setFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save SIM"
      );
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/sims/bulk", {
          carrier: bulkCarrier,
          branchId,
          purchaseDate: bulkDate || undefined,
          entries: bulkValid,
        })
      ).data as BulkSimResult,
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkText("");
      queryClient.invalidateQueries({ queryKey: ["sims"] });
      if (result.failed.length === 0) {
        setBulkOpen(false);
        setBulkCarrier("JIO");
        setBulkDate(today());
      }
    },
    onError: (err: unknown) => {
      setBulkFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to upload SIMs"
      );
    },
  });

  const bulkUploadExcelMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", bulkFile!);
      form.append("carrier", bulkCarrier);
      if (branchId) form.append("branchId", branchId);
      if (bulkDate) form.append("purchaseDate", bulkDate);
      return (await api.post("/sims/bulk/upload", form)).data as BulkSimResult;
    },
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkFile(null);
      queryClient.invalidateQueries({ queryKey: ["sims"] });
      if (result.failed.length === 0) {
        setBulkOpen(false);
        setBulkCarrier("JIO");
        setBulkDate(today());
      }
    },
    onError: (err: unknown) => {
      setBulkFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to upload SIMs"
      );
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/sims/${assignTarget!.id}/assign`, {
        customerId: assignCustomerId || undefined,
        imeiRecordId: assignImeiId || undefined,
        saleDate: assignSaleDate || undefined,
        billingCycle: assignBillingCycle,
      }),
    onSuccess: () => {
      closeAssignModal();
      queryClient.invalidateQueries({ queryKey: ["sims"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/sims/bulk-assign", {
          ids: Array.from(selectedIds),
          customerId: bulkAssignCustomerId,
          saleDate: bulkAssignSaleDate || undefined,
          billingCycle: bulkAssignBillingCycle,
        })
      ).data as { assigned: string[]; failed: { id: string; reason: string }[] },
    onSuccess: (result) => {
      setBulkAssignResult(result);
      clear();
      queryClient.invalidateQueries({ queryKey: ["sims"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["sims", "dashboard", branchId],
    queryFn: async () =>
      (
        await api.get("/sims", { params: { status: "ASSIGNED", branchId, pageSize: 1000 } })
      ).data as { items: Sim[] },
    enabled: dashboardOpen && !!branchId,
  });

  const customerBaskets = useMemo(() => {
    const items = dashboardData?.items ?? [];
    const map = new Map<string, { customer: Customer; total: number; byCarrier: Record<string, number> }>();
    for (const s of items) {
      if (!s.customer) continue;
      const existing = map.get(s.customer.id);
      if (existing) {
        existing.total += 1;
        existing.byCarrier[s.carrier] = (existing.byCarrier[s.carrier] ?? 0) + 1;
      } else {
        map.set(s.customer.id, { customer: s.customer, total: 1, byCarrier: { [s.carrier]: 1 } });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [dashboardData]);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/sims/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["sims"] });
    },
  });

  function extractError(err: unknown): string {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete SIM";
  }

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">SIM Management</h1>
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
                Total: {stats.total}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                Assigned: {stats.assigned}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600">
                Available: {stats.available}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDashboardOpen(true)}>
            Customer SIM Dashboard
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            Bulk Upload
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ Add SIM</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 mb-3 flex flex-wrap gap-2">
          <Input
            placeholder="Search ICCID / M2M number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={carrierFilter}
            onChange={(e) => {
              setCarrierFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All carriers</option>
            {CARRIER_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  {isSuperAdmin && <th className="p-3">Organization</th>}
                  <SortableTh label="ICCID" columnKey="iccid" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="M2M Number" columnKey="msisdn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Carrier" columnKey="carrier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Purchased" columnKey="purchaseDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Customer" columnKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Sale Date" columnKey="saleDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Billing" columnKey="billingCycle" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Device" columnKey="device" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="p-3" colSpan={isSuperAdmin ? 12 : 11}>
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.items.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                    {isSuperAdmin && (
                      <td className="p-3 text-muted-foreground">
                        {s.branch?.organization?.displayName || s.branch?.organization?.name || "-"}
                      </td>
                    )}
                    <td className="p-3 font-mono">{s.iccid}</td>
                    <td className="p-3 font-mono">{s.msisdn ?? "-"}</td>
                    <td className="p-3">{CARRIER_OPTIONS.find((c) => c.value === s.carrier)?.label ?? s.carrier}</td>
                    <td className="p-3">{formatDate(s.purchaseDate)}</td>
                    <td className="p-3">{s.customer?.name ?? "-"}</td>
                    <td className="p-3">{formatDate(s.saleDate)}</td>
                    <td className="p-3">
                      {BILLING_CYCLE_OPTIONS.find((b) => b.value === s.billingCycle)?.label ?? "-"}
                    </td>
                    <td className="p-3">{s.imeiRecord ? `${s.imeiRecord.imei}` : "-"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "ASSIGNED"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s.status === "ASSIGNED" ? "Assigned" : s.status === "AVAILABLE" ? "Available" : s.status}
                      </span>
                    </td>
                    <td className="p-3 flex gap-2">
                      {s.status === "AVAILABLE" && (
                        <Button size="sm" variant="outline" onClick={() => setAssignTarget(s)}>
                          Move to Client
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
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
        {selectedIds.size > 0 && (
          <div className="sticky bottom-20 z-40 mt-3 flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 shadow-lg">
            <span className="text-sm">
              {selectedIds.size} SIM{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button size="sm" onClick={() => setBulkAssignOpen(true)}>
              Assign to client
            </Button>
          </div>
        )}
        <BulkActionBar
          count={selectedIds.size}
          entityLabel="SIM"
          onClear={clear}
          isDeleting={false}
          onConfirmDelete={async () => {
            const res = await api.post("/sims/bulk-delete", { ids: Array.from(selectedIds) });
            clear();
            queryClient.invalidateQueries({ queryKey: ["sims"] });
            return res.data;
          }}
        />
      </div>

      <Modal open={addOpen || !!editTarget} onClose={closeModal} title={editTarget ? "Edit SIM" : "Add SIM"} size="lg">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidIccid(form.iccid)) {
              setFormError(ICCID_ERROR);
              return;
            }
            if (form.msisdn && !isValidM2mNumber(form.msisdn)) {
              setFormError(M2M_NUMBER_ERROR);
              return;
            }
            setFormError(null);
            (editTarget ? updateMutation : createMutation).mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ICCID * (20-21 characters, at least one letter)</label>
            <Input
              value={form.iccid}
              onChange={(e) =>
                setForm({ ...form, iccid: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 21) })
              }
              maxLength={21}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">M2M SIM number (optional, 13 digits)</label>
            <Input
              value={form.msisdn}
              onChange={(e) => setForm({ ...form, msisdn: e.target.value.replace(/\D/g, "").slice(0, 13) })}
              inputMode="numeric"
              maxLength={13}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Carrier *</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.carrier}
              onChange={(e) => setForm({ ...form, carrier: e.target.value as Carrier })}
            >
              {CARRIER_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {editTarget && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Client</p>
              <Input
                placeholder="Search by name or phone..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              >
                <option value="">Unassigned (Available)</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
              {form.customerId && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Sale date</label>
                    <Input
                      type="date"
                      value={form.saleDate}
                      max={today()}
                      onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
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
              )}
              <p className="text-xs text-muted-foreground">
                Status is set automatically: {form.customerId ? "Assigned" : "Available"}.
              </p>
            </div>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending
              ? "Saving..."
              : editTarget
                ? "Save changes"
                : "Add SIM"}
          </Button>
          {editTarget && (
            <DangerZone
              label="SIM"
              confirmText={editTarget.iccid}
              onDelete={() => deleteMutation.mutate()}
              isDeleting={deleteMutation.isPending}
              error={deleteMutation.isError ? extractError(deleteMutation.error) : null}
            />
          )}
        </form>
      </Modal>

      <Modal open={bulkOpen} onClose={closeBulkModal} title="Bulk Upload SIM Inventory" size="lg">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-md bg-muted p-1 w-fit">
            <button
              type="button"
              onClick={() => setBulkMode("paste")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                bulkMode === "paste" ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setBulkMode("excel")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                bulkMode === "excel" ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              Upload Excel file
            </button>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="ml-1 rounded px-3 py-1 text-xs font-medium text-primary hover:underline"
            >
              {showGuide ? "Hide guide" : "How does this work?"}
            </button>
          </div>

          {showGuide && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Guide: adding SIM stock in bulk</p>
              <ul className="list-disc pl-4 flex flex-col gap-1">
                <li>
                  <span className="font-medium text-foreground">ICCID</span> — the number printed on the physical SIM
                  card. Must be 20-21 characters and include at least one letter (e.g.{" "}
                  <span className="font-mono">8991000000000001A234</span>).
                </li>
                <li>
                  <span className="font-medium text-foreground">M2M / SIM number</span> — optional, exactly 13
                  digits. Leave blank if not known yet, you can add it later by editing the SIM.
                </li>
                <li>
                  <span className="font-medium text-foreground">Carrier</span> and{" "}
                  <span className="font-medium text-foreground">date of uploading</span> apply to the whole batch —
                  if you have SIMs from more than one carrier or bought on different dates, upload them in separate
                  batches.
                </li>
                <li>
                  <span className="font-medium text-foreground">Paste text</span>: type or scan one ICCID per line,
                  optionally followed by a comma and the M2M number.
                </li>
                <li>
                  <span className="font-medium text-foreground">Upload Excel file</span>: click "Download template"
                  for a ready-made file with the right columns (ICCID, SIM number). Fill it in and upload it back.
                </li>
              </ul>
            </div>
          )}

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBulkFormError(null);
              setBulkResult(null);
              if (bulkMode === "paste") {
                if (bulkInvalid.length > 0) {
                  setBulkFormError(`${bulkInvalid.length} line(s) invalid — fix or remove before uploading`);
                  return;
                }
                if (bulkValid.length === 0) {
                  setBulkFormError("Add at least one ICCID");
                  return;
                }
                bulkCreateMutation.mutate();
              } else {
                if (!bulkFile) {
                  setBulkFormError("Choose an Excel file to upload");
                  return;
                }
                bulkUploadExcelMutation.mutate();
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Carrier (Airtel / Jio / VI) *</label>
                <select
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                  value={bulkCarrier}
                  onChange={(e) => setBulkCarrier(e.target.value as Carrier)}
                >
                  {CARRIER_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  Date of uploading
                </label>
                <Input type="date" value={bulkDate} max={today()} onChange={(e) => setBulkDate(e.target.value)} />
              </div>
            </div>

            {bulkMode === "paste" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  ICCID (20-21 characters, at least one letter) — one per line. Optionally add the M2M number (13
                  digits) after a comma: <span className="font-mono">ICCID,M2M number</span>
                </label>
                <textarea
                  className="h-48 w-full rounded-md border border-border bg-card p-3 text-sm font-mono"
                  placeholder={"8991000000000001A234\n8991000000000001A235,9199999999999\n8991000000000001A2367"}
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value);
                    setBulkFormError(null);
                  }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  {bulkValid.length} valid SIM(s) detected
                  {bulkDuplicates.length > 0 ? `, ${bulkDuplicates.length} duplicate(s) ignored` : ""}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">
                    Excel file (.xlsx) with columns: ICCID, SIM number
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={templateDownloading}
                    onClick={downloadTemplate}
                  >
                    {templateDownloading ? "Downloading..." : "Download template"}
                  </Button>
                </div>
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
              </div>
            )}

            {bulkMode === "paste" && bulkInvalid.length > 0 && (
              <p className="text-sm text-destructive">Invalid lines, please fix: {bulkInvalid.join(" | ")}</p>
            )}
            {bulkFormError && <p className="text-sm text-destructive">{bulkFormError}</p>}
            {bulkResult && (
              <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <p>{bulkResult.created.length} added successfully.</p>
                {bulkResult.failed.length > 0 && (
                  <>
                    <p className="text-destructive">{bulkResult.failed.length} could not be added:</p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                      {bulkResult.failed.map((f) => (
                        <li key={f.iccid}>
                          {f.iccid}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <Button type="submit" disabled={bulkCreateMutation.isPending || bulkUploadExcelMutation.isPending}>
              {bulkCreateMutation.isPending || bulkUploadExcelMutation.isPending
                ? "Uploading..."
                : bulkMode === "paste" && bulkValid.length > 1
                  ? `Upload ${bulkValid.length} SIMs`
                  : "Upload"}
            </Button>
          </form>
        </div>
      </Modal>

      <Modal open={!!assignTarget} onClose={closeAssignModal} title={`Move SIM ${assignTarget?.iccid ?? ""} to client`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Search client</label>
            <Input
              placeholder="Search by name or phone..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Client</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={assignCustomerId}
              onChange={(e) => setAssignCustomerId(e.target.value)}
            >
              <option value="">Select client</option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Installed in device (IMEI, optional)</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={assignImeiId}
              onChange={(e) => setAssignImeiId(e.target.value)}
            >
              <option value="">None</option>
              {imeis?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.imei} ({i.product.name})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Sale date</label>
              <Input
                type="date"
                value={assignSaleDate}
                max={today()}
                onChange={(e) => setAssignSaleDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Billing cycle</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={assignBillingCycle}
                onChange={(e) => setAssignBillingCycle(e.target.value as BillingCycle)}
              >
                {BILLING_CYCLE_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={assignMutation.isPending || !assignCustomerId} onClick={() => assignMutation.mutate()}>
              {assignMutation.isPending ? "Saving..." : "Move to client"}
            </Button>
            <Button variant="outline" onClick={closeAssignModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkAssignOpen} onClose={closeBulkAssignModal} title={`Assign ${selectedIds.size} SIM(s) to client`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Search client</label>
            <Input
              placeholder="Search by name or phone..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Client</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={bulkAssignCustomerId}
              onChange={(e) => setBulkAssignCustomerId(e.target.value)}
            >
              <option value="">Select client</option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Sale date</label>
              <Input
                type="date"
                value={bulkAssignSaleDate}
                max={today()}
                onChange={(e) => setBulkAssignSaleDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Billing cycle</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={bulkAssignBillingCycle}
                onChange={(e) => setBulkAssignBillingCycle(e.target.value as BillingCycle)}
              >
                {BILLING_CYCLE_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {bulkAssignResult && (
            <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              <p>{bulkAssignResult.assigned.length} assigned successfully.</p>
              {bulkAssignResult.failed.length > 0 && (
                <>
                  <p className="text-destructive">{bulkAssignResult.failed.length} failed:</p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {bulkAssignResult.failed.map((f) => (
                      <li key={f.id}>{f.reason}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              disabled={bulkAssignMutation.isPending || !bulkAssignCustomerId}
              onClick={() => bulkAssignMutation.mutate()}
            >
              {bulkAssignMutation.isPending ? "Saving..." : "Assign selected"}
            </Button>
            <Button variant="outline" onClick={closeBulkAssignModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dashboardOpen} onClose={() => setDashboardOpen(false)} title="Customer SIM Dashboard" size="xl">
        <div className="flex flex-col gap-3">
          {dashboardLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!dashboardLoading && customerBaskets.length === 0 && (
            <p className="text-sm text-muted-foreground">No SIMs are currently assigned to any client.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customerBaskets.map(({ customer, total, byCarrier }) => (
              <button
                type="button"
                key={customer.id}
                onClick={() => {
                  setDashboardOpen(false);
                  navigate(`/sims/customer/${customer.id}`);
                }}
                className="flex flex-col gap-2 rounded-md border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{customer.name}</p>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {total} SIM{total === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(byCarrier).map(([carrier, count]) => (
                    <span
                      key={carrier}
                      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {CARRIER_OPTIONS.find((c) => c.value === carrier)?.label ?? carrier}: {count}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
