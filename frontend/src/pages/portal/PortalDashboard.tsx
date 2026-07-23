import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  IndianRupee,
  ShoppingCart,
  Smartphone,
  Wifi,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { portalApi } from "@/lib/portalApi";
import { StatTile } from "@/components/dashboard/StatTile";
import { LineChart } from "@/components/dashboard/LineChart";
import { BarChart } from "@/components/dashboard/BarChart";
import { DashboardDetailModal } from "@/components/dashboard/DashboardDetailModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/date";

interface DashboardStats {
  totalPurchases: number;
  totalSpend: number;
  activeDevices: number;
  activeSims: number;
  expiringSimsCount: number;
  openTickets: number;
  activeAmcCount: number;
  expiringAmcCount: number;
  recentActivity: { type: string; date: string; label: string; detail: string }[];
}

interface DashboardCharts {
  purchaseTrend: { date: string; value: number }[];
  deviceStatus: { name: string; value: number }[];
  subscriptionStatus: { name: string; value: number }[];
}

export function PortalDashboard() {
  const navigate = useNavigate();
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | null>(null);

  async function downloadReport(kind: "xlsx" | "pdf") {
    setDownloading(kind);
    try {
      const res = await portalApi.get(`/reports/export.${kind}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `account-report.${kind}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: async () => (await portalApi.get("/dashboard")).data as DashboardStats,
  });

  const { data: charts } = useQuery({
    queryKey: ["portal-dashboard-charts"],
    queryFn: async () => (await portalApi.get("/dashboard/charts")).data as DashboardCharts,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/portal/tickets")}>
            New Support Ticket
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/portal/purchases")}>
            View Purchases
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null}
            onClick={() => downloadReport("xlsx")}
          >
            {downloading === "xlsx" ? "Downloading..." : "Export Report (Excel)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={downloading !== null}
            onClick={() => downloadReport("pdf")}
          >
            {downloading === "pdf" ? "Downloading..." : "Export Report (PDF)"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading dashboard...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile
              label="Total spend"
              value={data.totalSpend}
              prefix="₹"
              icon={IndianRupee}
              onClick={() => setActiveDetail("purchases")}
            />
            <StatTile
              label="Total purchases"
              value={data.totalPurchases}
              icon={ShoppingCart}
              onClick={() => setActiveDetail("purchases")}
            />
            <StatTile
              label="My devices"
              value={data.activeDevices}
              icon={Smartphone}
              onClick={() => setActiveDetail("devices")}
            />
            <StatTile
              label="Active SIMs"
              value={data.activeSims}
              sublabel={data.expiringSimsCount > 0 ? `${data.expiringSimsCount} expiring soon` : undefined}
              tone={data.expiringSimsCount > 0 ? "warning" : "default"}
              icon={Wifi}
              onClick={() => navigate("/portal/sims")}
            />
            <StatTile
              label="Open support tickets"
              value={data.openTickets}
              icon={MessageSquare}
              onClick={() => setActiveDetail("tickets")}
            />
            <StatTile
              label="Active AMC contracts"
              value={data.activeAmcCount}
              sublabel={data.expiringAmcCount > 0 ? `${data.expiringAmcCount} expiring soon` : undefined}
              tone={data.expiringAmcCount > 0 ? "warning" : "default"}
              icon={ShieldCheck}
              onClick={() => setActiveDetail("amc")}
            />
          </div>

          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Purchases — last 14 days</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineChart data={charts.purchaseTrend} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Device warranty status</CardTitle>
                </CardHeader>
                <CardContent>
                  {charts.deviceStatus.every((d) => d.value === 0) ? (
                    <p className="text-sm text-muted-foreground">No devices yet.</p>
                  ) : (
                    <BarChart data={charts.deviceStatus} />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentActivity.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <div className="flex flex-col">
                  {data.recentActivity.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{a.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(a.date)}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {a.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <DashboardDetailModal
        type={activeDetail}
        branchId={null}
        onClose={() => setActiveDetail(null)}
        baseUrl="/dashboard/detail"
        apiClient={portalApi}
      />
    </div>
  );
}
