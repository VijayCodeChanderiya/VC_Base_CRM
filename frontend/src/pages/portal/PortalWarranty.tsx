import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

interface WarrantyClaim {
  id: string;
  status: string;
  description: string | null;
  claimDate: string;
  resolvedDate: string | null;
  resolution: string | null;
  imeiRecord: { imei: string; product: { name: string } } | null;
}

interface AmcContract {
  id: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "CANCELLED";
  billingAmount: string;
  billingCycle: string;
  vehicle: { registrationNumber: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "In progress",
  CLAIMED: "Resolved",
  EXPIRED: "Expired",
  VOID: "Void",
};

const AMC_STATUS_TONE: Record<AmcContract["status"], string> = {
  ACTIVE: "bg-primary/10 text-primary",
  EXPIRING_SOON: "bg-warning/15 text-warning",
  EXPIRED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function PortalWarranty() {
  const navigate = useNavigate();
  const { data: claimsData, isLoading: claimsLoading } = useQuery({
    queryKey: ["portal-warranty"],
    queryFn: async () => (await portalApi.get("/warranty")).data as { items: WarrantyClaim[] },
  });

  const { data: amcData, isLoading: amcLoading } = useQuery({
    queryKey: ["portal-amc"],
    queryFn: async () => (await portalApi.get("/amc")).data as { items: AmcContract[] },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Warranty & AMC</h1>
        <Button size="sm" variant="outline" onClick={() => navigate("/portal/devices")}>
          View my devices
        </Button>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">AMC Contracts</h2>

        {amcLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!amcLoading && (amcData?.items.length ?? 0) === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">No AMC contracts on record.</CardContent>
          </Card>
        )}

        {amcData && amcData.items.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Contract #</th>
                    <th className="px-4 py-2">Vehicle</th>
                    <th className="px-4 py-2">Billing</th>
                    <th className="px-4 py-2">Valid Until</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {amcData.items.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{c.contractNumber}</td>
                      <td className="px-4 py-2">{c.vehicle?.registrationNumber ?? "-"}</td>
                      <td className="px-4 py-2">₹{Number(c.billingAmount).toLocaleString()} / {c.billingCycle}</td>
                      <td className="px-4 py-2">{formatDate(c.endDate)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AMC_STATUS_TONE[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Warranty Claims</h2>

        {claimsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {claimsData?.items.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">No warranty claims on record.</CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {claimsData?.items.map((claim) => (
            <Card key={claim.id}>
              <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {claim.imeiRecord ? `${claim.imeiRecord.product.name} (${claim.imeiRecord.imei})` : "General claim"}
                  </p>
                  <span className="text-xs rounded-full bg-muted px-2 py-1">
                    {STATUS_LABEL[claim.status] ?? claim.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{claim.description ?? "No description provided"}</p>
                <p className="text-xs text-muted-foreground">
                  Filed {formatDate(claim.claimDate)}
                  {claim.resolvedDate && ` · Resolved ${formatDate(claim.resolvedDate)}`}
                </p>
                {claim.resolution && <p className="text-sm">Resolution: {claim.resolution}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
