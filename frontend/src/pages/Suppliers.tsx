import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { isValidPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from "@/lib/validators";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { SupplierDocuments } from "@/components/suppliers/SupplierDocuments";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  contactPerson: string | null;
  alternatePhone: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountHolder: string | null;
  categorySupplied: string | null;
  creditLimit: string | null;
  website: string | null;
  notes: string | null;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  contactPerson: "",
  alternatePhone: "",
  address: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  country: "",
  gstNumber: "",
  panNumber: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankAccountHolder: "",
  categorySupplied: "",
  creditLimit: "",
  website: "",
  notes: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Suppliers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", search, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/suppliers", {
          params: { search, page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Supplier[];
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
    if (!form.name.trim()) {
      setFormError("Supplier name is required");
      return false;
    }
    if (!isValidPhone(form.phone)) {
      setFormError(PHONE_ERROR);
      return false;
    }
    if (form.email && !isValidEmail(form.email)) {
      setFormError(EMAIL_ERROR);
      return false;
    }
    if (form.alternatePhone && !isValidPhone(form.alternatePhone)) {
      setFormError("Alternate phone must be exactly 10 digits");
      return false;
    }
    setFormError(null);
    return true;
  }

  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      phone: s.phone,
      email: s.email ?? "",
      contactPerson: s.contactPerson ?? "",
      alternatePhone: s.alternatePhone ?? "",
      address: s.address ?? "",
      addressLine2: s.addressLine2 ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      pincode: s.pincode ?? "",
      country: s.country ?? "",
      gstNumber: s.gstNumber ?? "",
      panNumber: s.panNumber ?? "",
      bankAccountNumber: s.bankAccountNumber ?? "",
      bankIfsc: s.bankIfsc ?? "",
      bankAccountHolder: s.bankAccountHolder ?? "",
      categorySupplied: s.categorySupplied ?? "",
      creditLimit: s.creditLimit ?? "",
      website: s.website ?? "",
      notes: s.notes ?? "",
    });
    setEditTarget(s);
  }

  const payload = () => ({
    name: form.name,
    phone: form.phone,
    email: form.email || undefined,
    contactPerson: form.contactPerson || undefined,
    alternatePhone: form.alternatePhone || undefined,
    address: form.address || undefined,
    addressLine2: form.addressLine2 || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    pincode: form.pincode || undefined,
    country: form.country || undefined,
    gstNumber: form.gstNumber || undefined,
    panNumber: form.panNumber || undefined,
    bankAccountNumber: form.bankAccountNumber || undefined,
    bankIfsc: form.bankIfsc || undefined,
    bankAccountHolder: form.bankAccountHolder || undefined,
    categorySupplied: form.categorySupplied || undefined,
    creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
    website: form.website || undefined,
    notes: form.notes || undefined,
  });

  function extractError(err: unknown): string {
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete supplier"
    );
  }

  const createMutation = useMutation({
    mutationFn: async () => api.post("/suppliers", payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/suppliers/${editTarget!.id}`, payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/suppliers/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  const isEditing = !!editTarget;
  const activeMutation = isEditing ? updateMutation : createMutation;

  function field(
    label: string,
    key: keyof typeof emptyForm,
    opts: { type?: string; placeholder?: string; className?: string } = {}
  ) {
    return (
      <div className={opts.className ?? "flex flex-col gap-1"}>
        <label className="text-xs text-muted-foreground">{label}</label>
        <Input
          type={opts.type ?? "text"}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={opts.placeholder}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add supplier</Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Input
          placeholder="Search suppliers..."
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
                  <SortableTh label="Name" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Phone" columnKey="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Email" columnKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh
                    label="Contact Person"
                    columnKey="contactPerson"
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
                    <td className="p-3" colSpan={6}>
                      Loading...
                    </td>
                  </tr>
                )}
                {data?.items.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                    <td className="p-3">{s.name}</td>
                    <td className="p-3">{s.phone}</td>
                    <td className="p-3">{s.email ?? "-"}</td>
                    <td className="p-3">{s.contactPerson ?? "-"}</td>
                    <td className="p-3">
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
        <BulkActionBar
          count={selectedIds.size}
          entityLabel="supplier"
          onClear={clear}
          isDeleting={false}
          onConfirmDelete={async () => {
            const res = await api.post("/suppliers/bulk-delete", { ids: Array.from(selectedIds) });
            clear();
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            return res.data;
          }}
        />
      </div>

      <Modal open={addOpen || isEditing} onClose={closeModal} title={isEditing ? "Edit supplier" : "Add supplier"} size="xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate()) return;
            activeMutation.mutate();
          }}
        >
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Required</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Supplier Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Phone * (10 digits)</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              {field("Email", "email", { type: "email", placeholder: "name@example.com" })}
              {field("Contact Person Name", "contactPerson")}
              {field("Alternate Phone", "alternatePhone", { placeholder: "10-digit number" })}
              {field("Website", "website", { placeholder: "https://example.com" })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Address</p>
            <div className="grid grid-cols-2 gap-3">
              {field("Address Line 1", "address", { className: "flex flex-col gap-1 col-span-2" })}
              {field("Address Line 2", "addressLine2", { className: "flex flex-col gap-1 col-span-2" })}
              {field("City", "city")}
              {field("State", "state")}
              {field("Pincode", "pincode")}
              {field("Country", "country")}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Tax &amp; Category</p>
            <div className="grid grid-cols-2 gap-3">
              {field("GSTIN / Tax ID", "gstNumber")}
              {field("PAN Number", "panNumber")}
              {field("Category / Products Supplied", "categorySupplied")}
              {field("Credit Limit", "creditLimit", { type: "number" })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Bank Details</p>
            <div className="grid grid-cols-2 gap-3">
              {field("Account Number", "bankAccountNumber")}
              {field("IFSC", "bankIfsc")}
              {field("Account Holder Name", "bankAccountHolder", { className: "flex flex-col gap-1 col-span-2" })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
            {field("Notes / Remarks", "notes", { className: "flex flex-col gap-1" })}
          </div>

          {isEditing && editTarget && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Attached Documents</p>
              <SupplierDocuments supplierId={editTarget.id} />
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={activeMutation.isPending}>
            {activeMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add supplier"}
          </Button>
          {isEditing && editTarget && (
            <DangerZone
              label="supplier"
              confirmText={editTarget.name}
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
