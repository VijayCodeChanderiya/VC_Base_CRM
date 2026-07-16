import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  customer: { name: string; phone: string; address: string | null; gstNumber: string | null };
  branch: { name: string; address: string | null };
  items: SaleItem[];
}

interface CompanyProfile {
  companyName?: string;
  address?: string;
  gstNumber?: string;
  currency?: string;
}

export function Invoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: async () => (await api.get(`/sales/${id}`)).data as SaleDetail,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get("/settings")).data as { companyProfile?: CompanyProfile },
  });

  const company = settings?.companyProfile;

  if (isLoading || !sale) {
    return <p className="text-sm text-muted-foreground">Loading invoice...</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            ← Back
          </Button>
          <h1 className="text-xl font-semibold">Invoice {sale.invoiceNumber}</h1>
        </div>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex justify-between">
            <div>
              <p className="font-semibold text-lg">{company?.companyName ?? "Your Company"}</p>
              <p className="text-sm text-muted-foreground">{company?.address}</p>
              {company?.gstNumber && <p className="text-sm text-muted-foreground">GSTIN: {company.gstNumber}</p>}
              <p className="text-sm text-muted-foreground">Branch: {sale.branch.name}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Tax Invoice</p>
              <p className="text-sm text-muted-foreground">{sale.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</p>
              <p className="text-sm text-muted-foreground">
                {sale.gstType === "INTRA_STATE" ? "Intra-state (CGST+SGST)" : "Inter-state (IGST)"}
              </p>
              {sale.placeOfSupply && <p className="text-sm text-muted-foreground">Place of supply: {sale.placeOfSupply}</p>}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase text-muted-foreground mb-1">Bill to</p>
            <p className="font-medium">{sale.customer.name}</p>
            <p className="text-sm text-muted-foreground">{sale.customer.phone}</p>
            {sale.customer.address && <p className="text-sm text-muted-foreground">{sale.customer.address}</p>}
            {sale.customer.gstNumber && (
              <p className="text-sm text-muted-foreground">GSTIN: {sale.customer.gstNumber}</p>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">HSN</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Taxable</th>
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
              {sale.items.map((item) => {
                const taxable = Number(item.unitPrice) * item.quantity;
                return (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="py-2">{item.product.name}</td>
                    <td className="py-2">{item.hsnCode ?? "-"}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{item.unitPrice}</td>
                    <td className="py-2 text-right">{taxable.toFixed(2)}</td>
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
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-64 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{sale.subtotal}</span>
              </div>
              {sale.gstType === "INTRA_STATE" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST</span>
                    <span>{sale.cgstTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST</span>
                    <span>{sale.sgstTotal}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST</span>
                  <span>{sale.igstTotal}</span>
                </div>
              )}
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
