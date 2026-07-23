import { useAuthStore } from "@/store/auth";
import { Dashboard } from "@/pages/Dashboard";
import { PlatformDashboard } from "@/pages/platform/PlatformDashboard";

export function HomeRoute() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "SUPER_ADMIN" ? <PlatformDashboard /> : <Dashboard />;
}
