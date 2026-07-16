import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBranchStore } from "@/store/branch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DangerZone } from "@/components/ui/DangerZone";
import { useRowSelection } from "@/lib/useRowSelection";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface Vehicle {
  id: string;
  registrationNumber: string;
  ownerCustomer: { name: string };
}

interface ImeiRecord {
  id: string;
  imei: string;
  product: { name: string };
}

interface Sim {
  id: string;
  iccid: string;
}

interface Installation {
  id: string;
  status: string;
  location: string | null;
  vehicle: { registrationNumber: string; ownerCustomer: { name: string } };
  imeiRecord: { imei: string; product: { name: string } };
  sim: { iccid: string } | null;
  installer: { name: string };
}

const STATUS_OPTIONS = ["SCHEDULED", "COMPLETED", "REMOVED", "CANCELLED"] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000];

export function Installations() {
  const queryClient = useQueryClient();
  const branchId = useBranchStore((s) => s.branchId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [imeiRecordId, setImeiRecordId] = useState("");
  const [simId, setSimId] = useState("");
  const [location, setLocation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Installation | null>(null);

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", "for-installation"],
    queryFn: async () => (await api.get("/vehicles", { params: { pageSize: 100 } })).data as { items: Vehicle[] },
  });

  const { data: imeis } = useQuery({
    queryKey: ["imei-list", "for-installation", branchId],
    queryFn: async () =>
      (await api.get("/imei", { params: { status: "SOLD", branchId, pageSize: 100 } })).data as {
        items: ImeiRecord[];
      },
    enabled: !!branchId,
  });

  const { data: sims } = useQuery({
    queryKey: ["sims", "for-installation", branchId],
    queryFn: async () =>
      (await api.get("/sims", { params: { status: "AVAILABLE", branchId, pageSize: 100 } })).data as {
        items: Sim[];
      },
    enabled: !!branchId,
  });

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data: installations, isLoading } = useQuery({
    queryKey: ["installations", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (
        await api.get("/installations", {
          params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir },
        })
      ).data as {
        items: Installation[];
        total: number;
        page: number;
        pageSize: number;
      },
  });

  const totalPages = installations ? Math.max(1, Math.ceil(installations.total / installations.pageSize)) : 1;

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/installations", {
        vehicleId,
        imeiRecordId,
        simId: simId || undefined,
        location: location || undefined,
        branchId,
      }),
    onSuccess: () => {
      setVehicleId("");
      setImeiRecordId("");
      setSimId("");
      setLocation("");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["installations"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/installations/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["installations"] }),
  });

  const selection = useRowSelection(installations?.items);

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/installations/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["installations"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post("/installations/bulk-delete", { ids })).data as {
        deleted: string[];
        failed: { id: string; reason: string }[];
      },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["installations"] }),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Installation Records</h1>
        <Button onClick={() => setAddOpen(true)}>+ Schedule installation</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Installations</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} />
                </th>
                <SortableTh label="Vehicle" columnKey="vehicle" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Owner" columnKey="owner" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Device" columnKey="device" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="SIM" columnKey="sim" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Installer" columnKey="installer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
              {installations?.items.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(i.id)}
                      onChange={() => selection.toggle(i.id)}
                    />
                  </td>
                  <td className="p-3 font-mono">{i.vehicle.registrationNumber}</td>
                  <td className="p-3">{i.vehicle.ownerCustomer.name}</td>
                  <td className="p-3">{i.imeiRecord.product.name} ({i.imeiRecord.imei})</td>
                  <td className="p-3">{i.sim?.iccid ?? "-"}</td>
                  <td className="p-3">{i.installer.name}</td>
                  <td className="p-3">
                    <select
                      className="h-8 rounded-md border border-border bg-card px-2 text-sm"
                      value={i.status}
                      onChange={(e) => statusMutation.mutate({ id: i.id, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(i)}>
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
              {installations && installations.total > 0
                ? `${(installations.page - 1) * installations.pageSize + 1}-${Math.min(installations.page * installations.pageSize, installations.total)} (${installations.total})`
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
        entityLabel="installation"
        onClear={selection.clear}
        isDeleting={bulkDeleteMutation.isPending}
        onConfirmDelete={async () => {
          const res = await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          return res;
        }}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete installation">
        {deleteTarget && (
          <DangerZone
            label="installation"
            confirmText={deleteTarget.vehicle.registrationNumber}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete installation"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Schedule installation">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Vehicle</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
            >
              <option value="">Select vehicle</option>
              {vehicles?.items.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber} ({v.ownerCustomer.name})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Device (IMEI)</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={imeiRecordId}
              onChange={(e) => setImeiRecordId(e.target.value)}
              required
            >
              <option value="">Select device</option>
              {imeis?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.imei} ({i.product.name})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">SIM (optional)</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={simId}
              onChange={(e) => setSimId(e.target.value)}
            >
              <option value="">None</option>
              {sims?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.iccid}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Scheduling..." : "Schedule"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
