import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTS = [
  { key: "sales", label: "Sales report", path: "/reports/sales.csv", filename: "sales-report.csv" },
  { key: "purchases", label: "Purchases report", path: "/reports/purchases.csv", filename: "purchases-report.csv" },
  { key: "inventory", label: "Inventory report", path: "/reports/inventory.csv", filename: "inventory-report.csv" },
];

export function Reports() {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(path: string, filename: string, key: string) {
    setDownloading(key);
    try {
      const res = await api.get(path, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Reports</h1>
      <Card>
        <CardHeader>
          <CardTitle>Export as CSV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {REPORTS.map((r) => (
            <div key={r.key} className="flex items-center justify-between border-b border-border last:border-0 pb-3 last:pb-0">
              <p className="text-sm">{r.label}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={downloading === r.key}
                onClick={() => download(r.path, r.filename, r.key)}
              >
                {downloading === r.key ? "Downloading..." : "Download CSV"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
