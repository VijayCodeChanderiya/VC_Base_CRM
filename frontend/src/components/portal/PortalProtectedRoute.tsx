import { Navigate, Outlet } from "react-router-dom";
import { useCustomerAuthStore } from "@/store/customerAuth";

export function PortalProtectedRoute() {
  const token = useCustomerAuthStore((s) => s.token);
  if (!token) {
    return <Navigate to="/portal/login" replace />;
  }
  return <Outlet />;
}
