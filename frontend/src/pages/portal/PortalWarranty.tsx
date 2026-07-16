import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SaleItem {
  id: string;
  product: { name: string; sku: string };
  imei: { imei: string } | null;
}

interface Sale {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  items: SaleItem[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "In progress",
  CLAIMED: "Resolved",
  EXPIRED: "Expired",
  VOID: "Void",
};

const WARRANTY_YEARS = 1;

function warrantyExpiry(purchaseDate: string) {
  const expiry = new Date(purchaseDate);
  expiry.setFullYear(expiry.getFullYear() + WARRANTY_YEARS);
  return expiry;
}

export function PortalWarranty() {
  const { data: claimsData, isLoading: claimsLoading } = useQuery({
    queryKey: ["portal-warranty"],
    queryFn: async () => (await portalApi.get("/warranty")).data as { items: WarrantyClaim[] },
  });

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["portal-sales"],
    queryFn: async () => (await portalApi.get("/sales")).data as { items: Sale[] },
  });

  const devices = (salesData?.items ?? []).flatMap((sale) =>
    sale.items
      .filter((item) => item.imei)
      .map((item) => {
        const expiry = warrantyExpiry(sale.createdAt);
        const active = expiry.getTime() >= Date.now();
        return {
          key: item.id,
          product: item.product.name,
          imei: item.imei!.imei,
          invoiceNumber: sale.invoiceNumber,
          purchaseDate: sale.createdAt,
          expiry,
          active,
        };
      })
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Warranty</h1>

      <Card>
        <CardHeader>
          <CardTitle>My Devices — Warranty Status</CardTitle>
          <p className="text-xs text-muted-foreground">
            Standard warranty is {WARRANTY_YEARS} year from the date of purchase.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {salesLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!salesLoading && devices.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No IMEI-tracked devices on record.</p>
          )}
          {devices.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Device</th>
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Purchased On</th>
                  <th className="px-4 py-2">Warranty Valid Until</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{d.product}</td>
                    <td className="px-4 py-2 font-mono text-xs">{d.imei}</td>
                    <td className="px-4 py-2">{d.invoiceNumber}</td>
                    <td className="px-4 py-2">{formatDate(d.purchaseDate)}</td>
                    <td className="px-4 py-2">{formatDate(d.expiry)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.active ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {d.active ? "Active" : "Expired"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

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
