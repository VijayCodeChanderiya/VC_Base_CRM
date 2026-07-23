import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { isValidPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from "@/lib/validators";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

const SOURCE_OPTIONS = [
  { value: "", label: "-" },
  { value: "GOOGLE", label: "Google" },
  { value: "INDIAMART", label: "IndiaMART" },
  { value: "JUSTDIAL", label: "JustDial" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
] as const;

type Carrier = "JIO" | "AIRTEL" | "VI" | "BSNL" | "OTHER";
type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

interface CustomerSim {
  id: string;
  iccid: string;
  carrier: Carrier;
  billingCycle: BillingCycle | null;
  status: string;
  expiryDate: string | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  username: string | null;
  city: string | null;
  address: string | null;
  company: string | null;
  gstNumber: string | null;
  source: string | null;
  sims: CustomerSim[];
  organization?: { name: string; displayName: string | null };
}

const CARRIER_LABELS: Record<Carrier, string> = {
  JIO: "Jio",
  AIRTEL: "Airtel",
  VI: "VI",
  BSNL: "BSNL",
  OTHER: "Other",
};

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  YEARLY: "Yearly",
};

interface CarrierGroup {
  carrier: CustomerSim["carrier"];
  sims: CustomerSim[];
}

function groupSimsByCarrier(sims: CustomerSim[]): CarrierGroup[] {
  const map = new Map<string, CarrierGroup>();
  for (const s of sims) {
    const existing = map.get(s.carrier);
    if (existing) existing.sims.push(s);
    else map.set(s.carrier, { carrier: s.carrier, sims: [s] });
  }
  return Array.from(map.values());
}

function SimBadge({ group }: { group: CarrierGroup }) {
  const isActive = group.sims.some((s) => s.status === "ACTIVE" || s.status === "ASSIGNED");
  const cycles = Array.from(new Set(group.sims.map((s) => s.billingCycle).filter(Boolean))) as NonNullable<
    CustomerSim["billingCycle"]
  >[];
  const cycleLabel = cycles.map((c) => BILLING_CYCLE_LABELS[c]).join(", ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
      }`}
      title={group.sims.map((s) => s.iccid).join(", ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-primary" : "bg-muted-foreground"}`} />
      {CARRIER_LABELS[group.carrier]}
      {group.sims.length > 1 && ` ×${group.sims.length}`}
      {cycleLabel && ` · ${cycleLabel}`}
    </span>
  );
}

function SimBadgeList({ sims }: { sims: CustomerSim[] }) {
  if (sims.length === 0) return <span className="text-muted-foreground">-</span>;
  const groups = groupSimsByCarrier(sims);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {groups.map((g) => (
        <SimBadge key={g.carrier} group={g} />
      ))}
    </div>
  );
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  city: "",
  address: "",
  company: "",
  gstNumber: "",
  source: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Customers() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "SUPER_ADMIN");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<Customer | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/customers", {
          params: { search, page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Customer[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function closeModal() {
    setAddOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function validate(): boolean {
    if (!isValidPhone(form.phone)) {
      setFormError(PHONE_ERROR);
      return false;
    }
    if (!isValidEmail(form.email)) {
      setFormError(EMAIL_ERROR);
      return false;
    }
    if (form.username.trim().length < 3) {
      setFormError("Username must be at least 3 characters");
      return false;
    }
    if (!editTarget && form.password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return false;
    }
    if (form.password && form.password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return false;
    }
    setFormError(null);
    return true;
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? "",
      username: c.username ?? "",
      password: "",
      city: c.city ?? "",
      address: c.address ?? "",
      company: c.company ?? "",
      gstNumber: c.gstNumber ?? "",
      source: c.source ?? "",
    });
    setEditTarget(c);
  }

  const payload = () => ({
    name: form.name,
    phone: form.phone,
    email: form.email || undefined,
    username: form.username,
    password: form.password || undefined,
    city: form.city || undefined,
    address: form.address || undefined,
    company: form.company || undefined,
    gstNumber: form.gstNumber || undefined,
    source: form.source || undefined,
  });

  function extractError(err: unknown): string {
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save customer"
    );
  }

  const createMutation = useMutation({
    mutationFn: async () => api.post("/customers", payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: unknown) => setFormError(extractError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/customers/${editTarget!.id}`, payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: unknown) => setFormError(extractError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/customers/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  function closeResetModal() {
    setResetTarget(null);
    setResetPassword("");
    setResetError(null);
    setResetSuccess(false);
  }

  const resetPasswordMutation = useMutation({
    mutationFn: async () => api.patch(`/customers/${resetTarget!.id}`, { password: resetPassword }),
    onSuccess: () => {
      setResetSuccess(true);
      setResetPassword("");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: unknown) => setResetError(extractError(err)),
  });

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  const isEditing = !!editTarget;
  const activeMutation = isEditing ? updateMutation : createMutation;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    activeMutation.mutate();
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add customer</Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs mb-3 shrink-0"
        />
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 min-h-0 overflow-auto p-0">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border text-left">
                <tr>
                  <th className="p-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  {isSuperAdmin && (
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Organization
                    </th>
                  )}
                  <SortableTh
                    label="Name"
                    columnKey="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  />
                  <SortableTh
                    label="Phone"
                    columnKey="phone"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  />
                  <SortableTh
                    label="City"
                    columnKey="city"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  />
                  <SortableTh
                    label="Company"
                    columnKey="company"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  />
                  <SortableTh
                    label="Source"
                    columnKey="source"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  />
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SIM Card
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Portal Username
                  </th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={isSuperAdmin ? 10 : 9}>
                      Loading...
                    </td>
                  </tr>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={isSuperAdmin ? 10 : 9}>
                      No customers found.
                    </td>
                  </tr>
                )}
                {data?.items.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/50 transition-colors">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.organization?.displayName || c.organization?.name || "-"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {c.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-foreground">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.city ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.company ?? "-"}</td>
                    <td className="px-4 py-3">
                      {c.source ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {SOURCE_OPTIONS.find((o) => o.value === c.source)?.label ?? c.source}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SimBadgeList sims={c.sims} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.username ? (
                        <span className="font-mono text-xs">{c.username}</span>
                      ) : (
                        <span className="text-xs">Not set up</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => setResetTarget(c)}
                        >
                          Reset Password
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
          entityLabel="customer"
          onClear={clear}
          isDeleting={false}
          onConfirmDelete={async () => {
            const res = await api.post("/customers/bulk-delete", { ids: Array.from(selectedIds) });
            clear();
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            return res.data;
          }}
        />
      </div>

      <Modal open={addOpen || isEditing} onClose={closeModal} title={isEditing ? "Edit customer" : "Add customer"} size="lg">
        <form className="grid grid-cols-2 gap-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Full Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Number * (10 digits)</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">City</label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
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
            <label className="text-xs text-muted-foreground">Company</label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">GST Number (optional)</label>
            <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs text-muted-foreground">Address</label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="col-span-2 mt-2 rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Customer Portal Login</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Username *</label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {isEditing ? "New Password (leave blank to keep current)" : "Password *"}
                </label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  placeholder={isEditing ? "••••••••" : "At least 8 characters"}
                  required={!isEditing}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs text-muted-foreground">Client from</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {formError && <p className="text-sm text-destructive col-span-2">{formError}</p>}
          <Button type="submit" disabled={activeMutation.isPending} className="col-span-2">
            {activeMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add customer"}
          </Button>
          {isEditing && editTarget && (
            <DangerZone
              label="customer"
              confirmText={editTarget.name}
              onDelete={() => deleteMutation.mutate()}
              isDeleting={deleteMutation.isPending}
              error={deleteMutation.isError ? extractError(deleteMutation.error) : null}
            />
          )}
        </form>
      </Modal>

      <Modal open={!!resetTarget} onClose={closeResetModal} title={`Reset portal password — ${resetTarget?.name ?? ""}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            The current password can't be viewed — it's stored one-way hashed. Set a new one below and share it with
            the customer directly; it won't be shown again after this.
          </p>
          {resetTarget?.username && (
            <p className="text-sm">
              Username: <span className="font-mono">{resetTarget.username}</span>
            </p>
          )}
          {resetSuccess ? (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
              <p>Password updated successfully.</p>
              <Button size="sm" variant="outline" onClick={closeResetModal}>
                Done
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setResetError(null);
                if (resetPassword.length < 8) {
                  setResetError("Password must be at least 8 characters");
                  return;
                }
                resetPasswordMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">New Password</label>
                <Input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? "Saving..." : "Set new password"}
              </Button>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
