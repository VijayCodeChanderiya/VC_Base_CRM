import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/date";

interface MyProduct {
  productId: string;
  name: string;
  sku: string;
  isActive: boolean;
  quantityOwned: number;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
}

export function PortalProducts() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-products"],
    queryFn: async () => (await portalApi.get("/products")).data as { items: MyProduct[] },
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">My Products</h1>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No products purchased yet.</p>
          )}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Quantity owned</th>
                  <th className="px-4 py-2">First purchased</th>
                  <th className="px-4 py-2">Last purchased</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.productId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-2">{p.quantityOwned}</td>
                    <td className="px-4 py-2">{formatDate(p.firstPurchaseDate)}</td>
                    <td className="px-4 py-2">{formatDate(p.lastPurchaseDate)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.isActive ? "Active" : "Discontinued"}
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
