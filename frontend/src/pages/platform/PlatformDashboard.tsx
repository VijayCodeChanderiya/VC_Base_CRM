import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Package, ShoppingCart, IndianRupee, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/StatTile";

interface PlatformStats {
  totalOrganizations: number;
  activeOrganizations: number;
  trialOrganizations: number;
  totalCustomers: number;
  totalProducts: number;
  totalUsers: number;
  salesThisMonth: number;
  revenueThisMonth: number;
  topOrganizations: { organizationId: string; name: string; revenue: number }[];
}

export function PlatformDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => (await api.get("/platform/organizations/stats")).data as PlatformStats,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground">Aggregated stats across every organization on the platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Organizations" value={data?.totalOrganizations ?? 0} icon={Building2} />
        <StatTile
          label="Active organizations"
          value={data?.activeOrganizations ?? 0}
          sublabel={`${data?.trialOrganizations ?? 0} on trial`}
          icon={Building2}
        />
        <StatTile label="Total customers" value={data?.totalCustomers ?? 0} icon={Users} />
        <StatTile label="Total products" value={data?.totalProducts ?? 0} icon={Package} />
        <StatTile label="Staff users" value={data?.totalUsers ?? 0} icon={Users} />
        <StatTile label="Sales this month" value={data?.salesThisMonth ?? 0} icon={ShoppingCart} />
        <StatTile
          label="Revenue this month"
          value={data?.revenueThisMonth ?? 0}
          prefix="₹"
          icon={IndianRupee}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock size={16} /> Top organizations by revenue this month
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !data?.topOrganizations.length ? (
            <p className="text-sm text-muted-foreground">No sales recorded this month yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.topOrganizations.map((org, i) => (
                <div
                  key={org.organizationId}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="text-sm font-medium">
                    {i + 1}. {org.name}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    ₹{org.revenue.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
