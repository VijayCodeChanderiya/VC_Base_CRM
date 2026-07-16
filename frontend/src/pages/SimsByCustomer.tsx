import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/date";
import { useTableSort } from "@/lib/useTableSort";
import { SortableTh } from "@/components/ui/SortableTh";

type Carrier = "JIO" | "AIRTEL" | "VI" | "BSNL" | "OTHER";
type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

interface Sim {
  id: string;
  iccid: string;
  msisdn: string | null;
  carrier: Carrier;
  billingCycle: BillingCycle | null;
  status: string;
  saleDate: string | null;
  expiryDate: string | null;
  customer: { id: string; name: string; phone: string } | null;
  imeiRecord: { imei: string; product: { name: string } } | null;
}

interface Renewal {
  id: string;
  billingCycle: BillingCycle;
  previousExpiryDate: string | null;
  newExpiryDate: string;
  createdAt: string;
  renewedBy: { name: string } | null;
}

const CARRIER_LABELS: Record<Carrier, string> = {
  JIO: "Jio",
  AIRTEL: "Airtel",
  VI: "VI (Vodafone Idea)",
  BSNL: "BSNL",
  OTHER: "Other",
};

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  YEARLY: "Yearly",
};

const BILLING_CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "YEARLY", label: "Yearly" },
];

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days <= 15;
}

export function SimsByCustomer() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [renewTarget, setRenewTarget] = useState<Sim | null>(null);
  const [renewBillingCycle, setRenewBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [historyTarget, setHistoryTarget] = useState<Sim | null>(null);

  const { data: customer } = useQuery({
    queryKey: ["customers", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data as { name: string; phone: string },
    enabled: !!customerId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["sims", "by-customer", customerId],
    queryFn: async () =>
      (await api.get("/sims", { params: { customerId, pageSize: 1000 } })).data as { items: Sim[] },
    enabled: !!customerId,
  });

  const { data: renewalData, isLoading: renewalsLoading } = useQuery({
    queryKey: ["sim-renewals", historyTarget?.id],
    queryFn: async () => (await api.get(`/sims/${historyTarget!.id}/renewals`)).data as { items: Renewal[] },
    enabled: !!historyTarget,
  });

  const renewMutation = useMutation({
    mutationFn: async () =>
      api.patch(`/sims/${renewTarget!.id}/renew`, { billingCycle: renewBillingCycle }),
    onSuccess: () => {
      setRenewTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sims", "by-customer", customerId] });
    },
  });

  async function downloadFile(path: string, filename: string) {
    const res = await api.get(path, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  const sims = data?.items ?? [];

  const { sorted: sortedSims, sortKey, sortDir, toggleSort } = useTableSort(sims, {
    iccid: (s) => s.iccid,
    msisdn: (s) => s.msisdn,
    carrier: (s) => s.carrier,
    saleDate: (s) => s.saleDate,
    expiryDate: (s) => s.expiryDate,
    billingCycle: (s) => s.billingCycle,
    device: (s) => s.imeiRecord?.imei,
    status: (s) => s.status,
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/sims")}>
            ← Back to SIMs
          </Button>
          <h1 className="mt-2 text-xl font-semibold">{customer?.name ?? "Customer"} — SIM Details</h1>
          {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!customerId || sims.length === 0}
            onClick={() =>
              downloadFile(
                `/sims/customer/${customerId}/export.xlsx`,
                `${(customer?.name ?? "customer").replace(/[^a-z0-9]/gi, "_")}-sims.xlsx`
              )
            }
          >
            Download Excel
          </Button>
          <Button
            variant="outline"
            disabled={!customerId || sims.length === 0}
            onClick={() =>
              downloadFile(
                `/sims/customer/${customerId}/export.pdf`,
                `${(customer?.name ?? "customer").replace(/[^a-z0-9]/gi, "_")}-sims.pdf`
              )
            }
          >
            Download PDF
          </Button>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="ICCID" columnKey="iccid" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="M2M Number" columnKey="msisdn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Carrier" columnKey="carrier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Sale Date" columnKey="saleDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Expiry Date" columnKey="expiryDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Billing" columnKey="billingCycle" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Device" columnKey="device" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={9}>
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && sims.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={9}>
                    No SIMs found for this customer.
                  </td>
                </tr>
              )}
              {sortedSims.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono">{s.iccid}</td>
                  <td className="p-3 font-mono">{s.msisdn ?? "-"}</td>
                  <td className="p-3">{CARRIER_LABELS[s.carrier] ?? s.carrier}</td>
                  <td className="p-3">{formatDate(s.saleDate)}</td>
                  <td className="p-3">
                    {s.expiryDate ? (
                      <span className={isExpiringSoon(s.expiryDate) ? "font-medium text-destructive" : ""}>
                        {formatDate(s.expiryDate)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{s.billingCycle ? BILLING_CYCLE_LABELS[s.billingCycle] : "-"}</td>
                  <td className="p-3">{s.imeiRecord ? s.imeiRecord.imei : "-"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "ASSIGNED" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.status === "ASSIGNED" ? "Assigned" : s.status === "AVAILABLE" ? "Available" : s.status}
                    </span>
                  </td>
                  <td className="p-3 flex gap-2">
                    {s.status === "ASSIGNED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenewTarget(s);
                          setRenewBillingCycle(s.billingCycle ?? "MONTHLY");
                        }}
                      >
                        Renew
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setHistoryTarget(s)}>
                      History
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={!!renewTarget} onClose={() => setRenewTarget(null)} title={`Renew SIM ${renewTarget?.iccid ?? ""}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Current expiry: {renewTarget?.expiryDate ? formatDate(renewTarget.expiryDate) : "Not set"}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Renewal plan</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={renewBillingCycle}
              onChange={(e) => setRenewBillingCycle(e.target.value as BillingCycle)}
            >
              {BILLING_CYCLE_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button disabled={renewMutation.isPending} onClick={() => renewMutation.mutate()}>
              {renewMutation.isPending ? "Renewing..." : "Renew"}
            </Button>
            <Button variant="outline" onClick={() => setRenewTarget(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`Renewal History — ${historyTarget?.iccid ?? ""}`}
        size="lg"
      >
        <div className="flex flex-col gap-2">
          {renewalsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!renewalsLoading && (renewalData?.items.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No renewals recorded yet.</p>
          )}
          {(renewalData?.items.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Renewed On</th>
                  <th className="py-1 pr-3">Plan</th>
                  <th className="py-1 pr-3">Previous Expiry</th>
                  <th className="py-1 pr-3">New Expiry</th>
                  <th className="py-1 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {renewalData?.items.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1 pr-3">{formatDate(r.createdAt)}</td>
                    <td className="py-1 pr-3">{BILLING_CYCLE_LABELS[r.billingCycle]}</td>
                    <td className="py-1 pr-3">{formatDate(r.previousExpiryDate)}</td>
                    <td className="py-1 pr-3">{formatDate(r.newExpiryDate)}</td>
                    <td className="py-1 pr-3">{r.renewedBy?.name ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </div>
  );
}
