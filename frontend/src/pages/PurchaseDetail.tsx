import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/date";
import { useTableSort } from "@/lib/useTableSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface ImeiRecord {
  id: string;
  imei: string;
  status: string;
  saleItem: {
    sale: { invoiceNumber: string; customer: { name: string; phone: string } };
  } | null;
}

interface PurchaseItem {
  id: string;
  quantity: number;
  unitCost: string;
  lineTotal: string;
  product: { name: string; sku: string; hasImei: boolean };
  imeiRecords: ImeiRecord[];
}

interface PurchaseDetail {
  purchaseNumber: string;
  invoiceNumber: string | null;
  purchaseDate: string;
  createdAt: string;
  status: string;
  grandTotal: string;
  supplier: { name: string; phone: string };
  branch: { name: string };
  items: PurchaseItem[];
}

function ItemImeiTable({ item }: { item: PurchaseItem }) {
  const { sorted: sortedRecords, sortKey, sortDir, toggleSort } = useTableSort(item.imeiRecords, {
    imei: (r) => r.imei,
    status: (r) => r.status,
    customer: (r) => r.saleItem?.sale.customer.name,
    invoice: (r) => r.saleItem?.sale.invoiceNumber,
  });

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border text-left text-muted-foreground">
        <tr>
          <SortableTh
            label="IMEI"
            columnKey="imei"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            className="p-2"
          />
          <SortableTh
            label="Status"
            columnKey="status"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            className="p-2"
          />
          <SortableTh
            label="Sold to (customer)"
            columnKey="customer"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            className="p-2"
          />
          <SortableTh
            label="Invoice"
            columnKey="invoice"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            className="p-2"
          />
        </tr>
      </thead>
      <tbody>
        {sortedRecords.map((r) => (
          <tr key={r.id} className="border-b border-border last:border-0">
            <td className="p-2 font-mono">{r.imei}</td>
            <td className="p-2">{r.status}</td>
            <td className="p-2">
              {r.saleItem ? `${r.saleItem.sale.customer.name} (${r.saleItem.sale.customer.phone})` : "-"}
            </td>
            <td className="p-2">{r.saleItem ? r.saleItem.sale.invoiceNumber : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: purchase, isLoading } = useQuery({
    queryKey: ["purchase", id],
    queryFn: async () => (await api.get(`/purchases/${id}`)).data as PurchaseDetail,
  });

  if (isLoading || !purchase) {
    return <p className="text-sm text-muted-foreground">Loading purchase...</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <Link to="/purchases" className="text-sm text-primary hover:underline w-fit">
        &larr; Back to purchases
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{purchase.purchaseNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {purchase.supplier.name} · {purchase.branch.name} · {formatDate(purchase.purchaseDate)} ·
          Status: {purchase.status}
          {purchase.invoiceNumber && <> · Invoice: {purchase.invoiceNumber}</>}
        </p>
      </div>

      {purchase.items.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {item.product.name} ({item.product.sku}) — Qty {item.quantity} @ {item.unitCost} = {item.lineTotal}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {item.product.hasImei ? (
              item.imeiRecords.length > 0 ? (
                <ItemImeiTable item={item} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Quantity recorded here for reference — no IMEIs linked yet. Add the actual devices from the IMEI
                  Search page.
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Quantity-tracked product — no per-unit IMEI history.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
