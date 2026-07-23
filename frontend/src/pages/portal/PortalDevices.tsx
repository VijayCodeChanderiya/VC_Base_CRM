import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/date";

interface MyDevice {
  id: string;
  imei: string;
  status: string;
  product: { name: string; sku: string };
  invoiceNumber: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  warrantyActive: boolean;
  sim: { iccid: string; status: string; expiryDate: string | null } | null;
  vehicle: { registrationNumber: string } | null;
}

export function PortalDevices() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-devices"],
    queryFn: async () => (await portalApi.get("/devices")).data as { items: MyDevice[] },
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">My Devices</h1>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No IMEI-tracked devices on record.</p>
          )}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Purchased on</th>
                  <th className="px-4 py-2">Warranty valid until</th>
                  <th className="px-4 py-2">SIM</th>
                  <th className="px-4 py-2">Vehicle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{d.product.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{d.imei}</td>
                    <td className="px-4 py-2">{d.invoiceNumber ?? "-"}</td>
                    <td className="px-4 py-2">{d.purchaseDate ? formatDate(d.purchaseDate) : "-"}</td>
                    <td className="px-4 py-2">
                      {d.warrantyExpiry ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            d.warrantyActive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {formatDate(d.warrantyExpiry)} · {d.warrantyActive ? "Active" : "Expired"}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{d.sim?.iccid ?? "-"}</td>
                    <td className="px-4 py-2">{d.vehicle?.registrationNumber ?? "-"}</td>
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
