import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface SearchResults {
  customers: { id: string; name: string; phone: string }[];
  products: { id: string; name: string; sku: string }[];
  imei: { id: string; imei: string; product: { name: string } }[];
  sales: { id: string; invoiceNumber: string; customer: { name: string } }[];
}

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["global-search", q],
    queryFn: async () => (await api.get("/search", { params: { q } })).data as SearchResults,
    enabled: q.trim().length >= 2,
  });

  const hasResults =
    !!data && (data.customers.length + data.products.length + data.imei.length + data.sales.length > 0);

  function goTo(path: string) {
    setOpen(false);
    setQ("");
    navigate(path);
  }

  return (
    <div className="relative w-80">
      <Input
        placeholder="Search customers, products, IMEI, invoices..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 mt-2 w-96 rounded-md border border-border bg-card shadow-lg z-40 max-h-96 overflow-y-auto text-sm">
          {!hasResults && <p className="p-3 text-muted-foreground">No results</p>}

          {data && data.customers.length > 0 && (
            <div>
              <p className="px-3 pt-2 text-xs uppercase text-muted-foreground">Customers</p>
              {data.customers.map((c) => (
                <button
                  key={c.id}
                  className="block w-full text-left px-3 py-2 hover:bg-muted"
                  onClick={() => goTo("/customers")}
                >
                  {c.name} — {c.phone}
                </button>
              ))}
            </div>
          )}

          {data && data.products.length > 0 && (
            <div>
              <p className="px-3 pt-2 text-xs uppercase text-muted-foreground">Products</p>
              {data.products.map((p) => (
                <button
                  key={p.id}
                  className="block w-full text-left px-3 py-2 hover:bg-muted"
                  onClick={() => goTo("/products")}
                >
                  {p.name} ({p.sku})
                </button>
              ))}
            </div>
          )}

          {data && data.imei.length > 0 && (
            <div>
              <p className="px-3 pt-2 text-xs uppercase text-muted-foreground">IMEI</p>
              {data.imei.map((r) => (
                <button
                  key={r.id}
                  className="block w-full text-left px-3 py-2 hover:bg-muted font-mono"
                  onClick={() => goTo("/imei")}
                >
                  {r.imei} — {r.product.name}
                </button>
              ))}
            </div>
          )}

          {data && data.sales.length > 0 && (
            <div>
              <p className="px-3 pt-2 text-xs uppercase text-muted-foreground">Invoices</p>
              {data.sales.map((s) => (
                <button
                  key={s.id}
                  className="block w-full text-left px-3 py-2 hover:bg-muted"
                  onClick={() => goTo("/sales")}
                >
                  {s.invoiceNumber} — {s.customer.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
