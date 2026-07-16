import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCustomerAuthStore } from "@/store/customerAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CompanyBrand } from "@/components/portal/CompanyBrand";
import { WhatsAppHelpButton } from "@/components/portal/WhatsAppHelpButton";

const NAV_ITEMS = [
  { to: "/portal", label: "My Purchases" },
  { to: "/portal/returns", label: "Returns" },
  { to: "/portal/warranty", label: "Warranty" },
  { to: "/portal/account", label: "Account" },
];

export function PortalLayout() {
  const { customer, logout } = useCustomerAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/portal/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CompanyBrand />
            <span className="hidden text-xs text-muted-foreground sm:inline">|</span>
            <p className="text-sm text-muted-foreground">Hi, {customer?.name}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/portal"}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Button variant="outline" size="sm" onClick={handleLogout} className="ml-2">
              Log out
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl w-full">
          <Outlet />
        </div>
      </main>
      <WhatsAppHelpButton />
    </div>
  );
}
