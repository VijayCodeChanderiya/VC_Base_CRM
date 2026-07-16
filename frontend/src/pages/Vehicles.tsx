import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBranchStore } from "@/store/branch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
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

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  ownerCustomer: Customer;
  installations: { id: string; status: string; imeiRecord: { imei: string; product: { name: string } } }[];
}

const emptyForm = { registrationNumber: "", make: "", model: "", year: "", ownerCustomerId: "" };

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Vehicles() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: customers } = useQuery({
    queryKey: ["customers", "for-vehicle"],
    queryFn: async () => (await api.get("/customers", { params: { pageSize: 100 } })).data as { items: Customer[] },
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles", search, page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/vehicles", {
          params: { search, page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Vehicle[];
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
  }

  function openEdit(v: Vehicle) {
    setForm({
      registrationNumber: v.registrationNumber,
      make: v.make ?? "",
      model: v.model ?? "",
      year: v.year ? String(v.year) : "",
      ownerCustomerId: v.ownerCustomer.id,
    });
    setEditTarget(v);
  }

  const payload = () => ({
    registrationNumber: form.registrationNumber,
    make: form.make || undefined,
    model: form.model || undefined,
    year: form.year ? Number(form.year) : undefined,
    ownerCustomerId: form.ownerCustomerId,
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post("/vehicles", { ...payload(), branchId }),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => api.patch(`/vehicles/${editTarget!.id}`, payload()),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/vehicles/${editTarget!.id}`),
    onSuccess: () => {
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  function extractError(err: unknown): string {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete vehicle";
  }

  const { selectedIds, toggle, toggleAll, clear, allSelected } = useRowSelection(data?.items);

  const isEditing = !!editTarget;
  const activeMutation = isEditing ? updateMutation : createMutation;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vehicle Management</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add vehicle</Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Input
          placeholder="Search registration / make / model..."
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
                  <SortableTh
                    label="Reg. number"
                    columnKey="registrationNumber"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Make / Model"
                    columnKey="makeModel"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh label="Owner" columnKey="owner" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="p-3">Installed devices</th>
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
                {data?.items.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggle(v.id)} />
                    </td>
                    <td className="p-3 font-mono">{v.registrationNumber}</td>
                    <td className="p-3">
                      {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                    </td>
                    <td className="p-3">{v.ownerCustomer.name}</td>
                    <td className="p-3">
                      {v.installations.length === 0
                        ? "-"
                        : v.installations
                            .map((i) => `${i.imeiRecord.product.name} (${i.status})`)
                            .join(", ")}
                    </td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => openEdit(v)}>
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
          entityLabel="vehicle"
          onClear={clear}
          isDeleting={false}
          onConfirmDelete={async () => {
            const res = await api.post("/vehicles/bulk-delete", { ids: Array.from(selectedIds) });
            clear();
            queryClient.invalidateQueries({ queryKey: ["vehicles"] });
            return res.data;
          }}
        />
      </div>

      <Modal open={addOpen || isEditing} onClose={closeModal} title={isEditing ? "Edit vehicle" : "Add vehicle"}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            activeMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Registration number</label>
            <Input
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Make</label>
            <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Model</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Year</label>
            <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Owner</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.ownerCustomerId}
              onChange={(e) => setForm({ ...form, ownerCustomerId: e.target.value })}
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
          <Button type="submit" disabled={activeMutation.isPending}>
            {activeMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add vehicle"}
          </Button>
          {isEditing && editTarget && (
            <DangerZone
              label="vehicle"
              confirmText={editTarget.registrationNumber}
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
