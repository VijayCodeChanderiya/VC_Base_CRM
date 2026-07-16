import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/date";

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: string;
  taxPercent: string;
  hsnCode: string | null;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
  product: { name: string; sku: string };
}

interface SaleDetail {
  invoiceNumber: string;
  createdAt: string;
  gstType: "INTRA_STATE" | "INTER_STATE";
  placeOfSupply: string | null;
  subtotal: string;
  taxTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  discountTotal: string;
  grandTotal: string;
  branch: { name: string; address: string | null };
  items: SaleItem[];
}

export function PortalInvoice() {
  const { id } = useParams<{ id: string }>();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["portal-sale", id],
    queryFn: async () => (await portalApi.get(`/sales/${id}`)).data as SaleDetail,
  });

  if (isLoading || !sale) {
    return <p className="text-sm text-muted-foreground">Loading invoice...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/portal" className="text-sm text-primary hover:underline">
          &larr; Back to purchases
        </Link>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex justify-between">
            <div>
              <p className="font-semibold text-lg">{sale.branch.name}</p>
              <p className="text-sm text-muted-foreground">{sale.branch.address}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Tax Invoice</p>
              <p className="text-sm text-muted-foreground">{sale.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">HSN</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                {sale.gstType === "INTRA_STATE" ? (
                  <>
                    <th className="py-2 text-right">CGST</th>
                    <th className="py-2 text-right">SGST</th>
                  </>
                ) : (
                  <th className="py-2 text-right">IGST</th>
                )}
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2">{item.product.name}</td>
                  <td className="py-2">{item.hsnCode ?? "-"}</td>
                  <td className="py-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right">{item.unitPrice}</td>
                  {sale.gstType === "INTRA_STATE" ? (
                    <>
                      <td className="py-2 text-right">{item.cgstAmount}</td>
                      <td className="py-2 text-right">{item.sgstAmount}</td>
                    </>
                  ) : (
                    <td className="py-2 text-right">{item.igstAmount}</td>
                  )}
                  <td className="py-2 text-right">{item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-64 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{sale.subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{sale.taxTotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{sale.discountTotal}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-1">
                <span>Grand total</span>
                <span>{sale.grandTotal}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}