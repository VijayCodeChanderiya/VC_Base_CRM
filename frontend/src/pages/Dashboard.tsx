import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  ScanLine,
  Undo2,
  ShieldCheck,
  RotateCcw,
  Smartphone,
  Car,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/StatTile";
import { LineChart } from "@/components/dashboard/LineChart";
import { BarChart } from "@/components/dashboard/BarChart";
import { CustomizePanel } from "@/components/dashboard/CustomizePanel";
import { PurchaseTrendChart } from "@/components/dashboard/PurchaseTrendChart";
import { DashboardDetailModal } from "@/components/dashboard/DashboardDetailModal";
import { useDashboardPrefs } from "@/store/dashboardPrefs";
import { useBranchStore } from "@/store/branch";

interface DashboardStats {
  salesThisMonth: number;
  revenueThisMonth: number;
  totalCustomers: number;
  totalProducts: number;
  lowStockCount: number;
  imeiInStock: number;
  imeiSold: number;
  pendingReturns: number;
  activeWarrantyClaims: number;
  pendingRma: number;
  activeSims: number;
  totalVehicles: number;
  salesTrend: { date: string; revenue: number }[];
  purchaseTrend: { date: string; amount: number }[];
  topProducts: { productId: string; name: string; revenue: number; quantity: number }[];
}

export function Dashboard() {
  const branchId = useBranchStore((s) => s.branchId);
  const { visibility } = useDashboardPrefs();
  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", branchId],
    queryFn: async () => (await api.get("/dashboard/stats", { params: { branchId } })).data as DashboardStats,
    enabled: !!branchId,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <CustomizePanel />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading dashboard...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibility.revenue && (
              <StatTile
                label="Revenue this month"
                value={data.revenueThisMonth}
                prefix="₹"
                icon={IndianRupee}
                onClick={() => setActiveDetail("revenue")}
              />
            )}
            {visibility.salesCount && (
              <StatTile
                label="Sales this month"
                value={data.salesThisMonth}
                icon={ShoppingCart}
                onClick={() => setActiveDetail("salesCount")}
              />
            )}
            {visibility.customers && (
              <StatTile
                label="Total customers"
                value={data.totalCustomers}
                icon={Users}
                onClick={() => setActiveDetail("customers")}
              />
            )}
            {visibility.products && (
              <StatTile
                label="Active products"
                value={data.totalProducts}
                icon={Package}
                onClick={() => setActiveDetail("products")}
              />
            )}
            {visibility.lowStock && (
              <StatTile
                label="Low stock alerts"
                value={data.lowStockCount}
                tone={data.lowStockCount > 0 ? "warning" : "default"}
                icon={AlertTriangle}
                onClick={() => setActiveDetail("lowStock")}
              />
            )}
            {visibility.imeiStock && (
              <StatTile
                label="IMEI in stock / sold"
                value={data.imeiInStock}
                sublabel={`${data.imeiSold.toLocaleString()} sold`}
                icon={ScanLine}
                onClick={() => setActiveDetail("imeiStock")}
              />
            )}
            {visibility.pendingReturns && (
              <StatTile
                label="Pending returns"
                value={data.pendingReturns}
                tone={data.pendingReturns > 0 ? "warning" : "default"}
                icon={Undo2}
                onClick={() => setActiveDetail("pendingReturns")}
              />
            )}
            {visibility.warrantyClaims && (
              <StatTile
                label="Active warranty claims"
                value={data.activeWarrantyClaims}
                icon={ShieldCheck}
                onClick={() => setActiveDetail("warrantyClaims")}
              />
            )}
            {visibility.pendingRma && (
              <StatTile
                label="Open RMA cases"
                value={data.pendingRma}
                tone={data.pendingRma > 0 ? "warning" : "default"}
                icon={RotateCcw}
                onClick={() => setActiveDetail("pendingRma")}
              />
            )}
            {visibility.activeSims && (
              <StatTile
                label="Active SIMs"
                value={data.activeSims}
                icon={Smartphone}
                onClick={() => setActiveDetail("activeSims")}
              />
            )}
            {visibility.vehicles && (
              <StatTile
                label="Vehicles tracked"
                value={data.totalVehicles}
                icon={Car}
                onClick={() => setActiveDetail("vehicles")}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibility.salesTrend && (
              <Card
                onClick={() => setActiveDetail("salesTrend")}
                className="select-none cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
              >
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Sales revenue — last 14 days</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineChart data={data.salesTrend.map((d) => ({ date: d.date, value: d.revenue }))} />
                </CardContent>
              </Card>
            )}
            <Card className="select-none cursor-default">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Purchase trend</CardTitle>
              </CardHeader>
              <CardContent>
                <PurchaseTrendChart branchId={branchId} initialData={data.purchaseTrend} />
              </CardContent>
            </Card>
            {visibility.topProducts && (
              <Card
                onClick={() => setActiveDetail("topProducts")}
                className="select-none cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
              >
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Top products by revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No sales yet.</p>
                  ) : (
                    <BarChart data={data.topProducts.map((p) => ({ name: p.name, value: p.revenue }))} />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      <DashboardDetailModal type={activeDetail} branchId={branchId} onClose={() => setActiveDetail(null)} />
    </div>
  );
}
