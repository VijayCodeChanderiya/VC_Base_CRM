import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date";

interface ReturnItem {
  id: string;
  quantity: number;
  refundAmt: string;
  saleItem: { product: { name: string } };
}

interface ReturnRecord {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  createdAt: string;
  sale: { invoiceNumber: string };
  items: ReturnItem[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "text-amber-600",
  APPROVED: "text-primary",
  COMPLETED: "text-green-600",
  REJECTED: "text-destructive",
};

export function PortalReturns() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-returns"],
    queryFn: async () => (await portalApi.get("/returns")).data as { items: ReturnRecord[] },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Returns</h1>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {data?.items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No returns on record.</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {data?.items.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">
                  {r.type} — Invoice {r.sale.invoiceNumber}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
              </div>
              <span className={`text-sm font-medium ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
            </CardHeader>
            <CardContent>
              {r.reason && <p className="mb-2 text-sm text-muted-foreground">Reason: {r.reason}</p>}
              <ul className="text-sm text-muted-foreground flex flex-col gap-1">
                {r.items.map((item) => (
                  <li key={item.id}>
                    {item.saleItem.product.name} × {item.quantity} — refund {item.refundAmt}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
