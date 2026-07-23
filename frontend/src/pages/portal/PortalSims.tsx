import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

type Carrier = "JIO" | "AIRTEL" | "VI" | "BSNL" | "OTHER";
type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
type SimStatus = "AVAILABLE" | "ASSIGNED" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

interface MySim {
  id: string;
  iccid: string;
  msisdn: string | null;
  carrier: Carrier;
  billingCycle: BillingCycle | null;
  status: SimStatus;
  activatedAt: string | null;
  expiryDate: string | null;
}

const CARRIER_LABELS: Record<Carrier, string> = {
  JIO: "Jio",
  AIRTEL: "Airtel",
  VI: "VI (Vodafone Idea)",
  BSNL: "BSNL",
  OTHER: "Other",
};

const STATUS_LABELS: Record<SimStatus, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<SimStatus, string> = {
  AVAILABLE: "bg-muted text-muted-foreground",
  ASSIGNED: "bg-primary/10 text-primary",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  SUSPENDED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CANCELLED: "bg-destructive/10 text-destructive",
};

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

export function PortalSims() {
  const [q, setQ] = useState("");
  const [carrier, setCarrier] = useState("");
  const [status, setStatus] = useState("");
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | null>(null);

  const params = { q: q || undefined, carrier: carrier || undefined, status: status || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["portal-sims", q, carrier, status],
    queryFn: async () => (await portalApi.get("/sims", { params })).data as { items: MySim[]; total: number },
  });

  const items = data?.items ?? [];
  const expiringSoon = items.filter((s) => isExpiringSoon(s.expiryDate));

  async function download(kind: "xlsx" | "pdf") {
    setDownloading(kind);
    try {
      const res = await portalApi.get(`/sims/export.${kind}`, { params, responseType: "blob" });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sim-report.${kind}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">SIM Management</h1>
          <p className="text-sm text-muted-foreground">
            All SIM cards linked to your account, independent of any GPS device.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null || items.length === 0}
            onClick={() => download("xlsx")}
          >
            {downloading === "xlsx" ? "Downloading..." : "Export Excel"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null || items.length === 0}
            onClick={() => download("pdf")}
          >
            {downloading === "pdf" ? "Downloading..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {expiringSoon.length} SIM{expiringSoon.length === 1 ? "" : "s"} expiring within 30 days — renew soon to
          avoid service interruption.
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Input
            placeholder="Search ICCID or mobile number..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
          >
            <option value="">All operators</option>
            {(Object.keys(CARRIER_LABELS) as Carrier[]).map((c) => (
              <option key={c} value={c}>
                {CARRIER_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as SimStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {(q || carrier || status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQ("");
                setCarrier("");
                setStatus("");
              }}
            >
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {q || carrier || status ? "No SIMs match your filters." : "No SIM cards on record."}
            </p>
          )}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">ICCID</th>
                  <th className="px-4 py-2">Mobile Number</th>
                  <th className="px-4 py-2">Operator</th>
                  <th className="px-4 py-2">Activation Date</th>
                  <th className="px-4 py-2">Expiry / Renewal</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{s.iccid}</td>
                    <td className="px-4 py-2 font-mono text-xs">{s.msisdn ?? "-"}</td>
                    <td className="px-4 py-2">{CARRIER_LABELS[s.carrier]}</td>
                    <td className="px-4 py-2">{s.activatedAt ? formatDate(s.activatedAt) : "-"}</td>
                    <td className="px-4 py-2">
                      {s.expiryDate ? (
                        <span className={isExpiringSoon(s.expiryDate) ? "font-medium text-destructive" : ""}>
                          {formatDate(s.expiryDate)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[s.status])}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
