import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BranchSelector } from "@/components/layout/BranchSelector";

interface NavItem {
  to: string;
  label: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const TOP_LINKS: NavItem[] = [{ to: "/", label: "Dashboard" }];

const NAV_GROUPS: NavGroup[] = [
  {
    key: "stock",
    label: "Stock",
    items: [
      { to: "/imei", label: "IMEI Search" },
      { to: "/purchases", label: "Purchase" },
      { to: "/rma", label: "RMA" },
    ],
  },
  {
    key: "billing",
    label: "Billing",
    items: [
      { to: "/sales", label: "Sale" },
      { to: "/returns", label: "Return" },
      { to: "/warranty", label: "Warranty" },
    ],
  },
];

const REPORTS_LINK: NavItem = { to: "/reports", label: "Reports" };

const GENERAL_GROUP: NavGroup = {
  key: "general",
  label: "General",
  items: [
    { to: "/customers", label: "Customer" },
    { to: "/suppliers", label: "Supplier" },
    { to: "/products", label: "Products" },
    { to: "/sims", label: "SIM Management" },
    { to: "/vehicles", label: "Vehicle" },
    { to: "/installations", label: "Installation" },
    { to: "/files", label: "Files" },
  ],
};

const ADMIN_GROUP: NavGroup = {
  key: "admin",
  label: "Admin",
  items: [
    { to: "/users", label: "Users" },
    { to: "/audit-logs", label: "Audit Logs" },
    { to: "/activity-report", label: "Activity Report" },
    { to: "/settings", label: "Settings" },
    { to: "/backup", label: "Backup & Restore" },
    { to: "/branches", label: "Branches" },
  ],
};

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "block rounded-md px-3 py-2 text-sm hover:bg-muted",
    isActive && "bg-muted font-medium text-foreground"
  );
}

function groupMatches(group: NavGroup, pathname: string) {
  return group.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(() => groupMatches(group, pathname));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        {group.label}
        <span className={cn("text-xs text-muted-foreground transition-transform", open && "rotate-90")}>
          &gt;
        </span>
      </button>
      {open && (
        <div className="ml-2 flex flex-col gap-1 border-l border-border pl-2">
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border bg-card p-4 flex flex-col gap-1 overflow-y-auto">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold">Alphatech CRM</p>
          <p className="text-xs text-muted-foreground">{user?.role}</p>
        </div>

        {TOP_LINKS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
            {item.label}
          </NavLink>
        ))}

        {NAV_GROUPS.map((group) => (
          <NavGroupSection key={group.key} group={group} pathname={pathname} />
        ))}

        <NavLink to={REPORTS_LINK.to} className={linkClass}>
          {REPORTS_LINK.label}
        </NavLink>

        <NavGroupSection group={GENERAL_GROUP} pathname={pathname} />

        {user?.role === "ADMIN" && <NavGroupSection group={ADMIN_GROUP} pathname={pathname} />}

        <div className="mt-auto pt-4">
          <p className="px-2 pb-2 text-xs text-muted-foreground truncate">{user?.email}</p>
          <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="shrink-0 flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3">
          <GlobalSearch />
          <div className="flex items-center gap-3">
            <BranchSelector />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 min-h-0 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
