import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore, type Role } from "@/store/auth";

// Frontend authorization is defense-in-depth only — the backend independently enforces
// the same role/organization boundaries on every request. This exists so a user who
// guesses/bookmarks a URL they aren't allowed to use gets redirected instead of hitting
// a broken page full of 403 errors.
export function RequireRole({ allow, redirectTo = "/" }: { allow: Role[]; redirectTo?: string }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !allow.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
