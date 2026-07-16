import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { portalApi } from "@/lib/portalApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date";

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  product: { name: string; sku: string };
  imei: { imei: string } | null;
}

interface Sale {
  id: string;
  invoiceNumber: string;
  status: string;
  grandTotal: string;
  createdAt: string;
  branch: { name: string };
  items: SaleItem[];
}

export function PortalPurchases() {
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-sales"],
    queryFn: async () => (await portalApi.get("/sales")).data as { items: Sale[] },
  });

  async function download(kind: "csv" | "pdf") {
    setDownloading(kind);
    try {
      const res = await portalApi.get(`/sales/export.${kind}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `purchase-history.${kind}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">My Purchases</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null || !data?.items.length}
            onClick={() => download("csv")}
          >
            {downloading === "csv" ? "Downloading..." : "Download Excel"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null || !data?.items.length}
            onClick={() => download("pdf")}
          >
            {downloading === "pdf" ? "Downloading..." : "Download PDF"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {data?.items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No purchases on record yet.</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {data?.items.map((sale) => (
          <Card key={sale.id} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between bg-muted/40">
              <div>
                <CardTitle className="text-sm font-medium">{sale.invoiceNumber}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {formatDate(sale.createdAt)} · {sale.branch.name}
                </p>
              </div>
              <Link to={`/portal/invoice/${sale.id}`} className="text-sm text-primary hover:underline">
                View invoice
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Device / IMEI</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Unit Price</th>
                    <th className="px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        {item.product.name}
                        <span className="ml-1 text-xs text-muted-foreground">({item.product.sku})</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{item.imei?.imei ?? "-"}</td>
                      <td className="px-4 py-2">{item.quantity}</td>
                      <td className="px-4 py-2">{item.unitPrice}</td>
                      <td className="px-4 py-2">{item.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                Total: {sale.grandTotal}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
