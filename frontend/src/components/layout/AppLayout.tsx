import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  ScanLine,
  ShoppingCart,
  RotateCcw,
  Receipt,
  ReceiptText,
  Undo2,
  ShieldCheck,
  BarChart3,
  LayoutGrid,
  Users,
  Truck,
  Package,
  Smartphone,
  Car,
  Wrench,
  FileText,
  ShieldAlert,
  UserCog,
  History,
  Activity,
  Settings as SettingsIcon,
  DatabaseBackup,
  Building2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BranchSelector } from "@/components/layout/BranchSelector";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const TOP_LINKS: NavItem[] = [{ to: "/", label: "Dashboard", icon: LayoutDashboard }];

const NAV_GROUPS: NavGroup[] = [
  {
    key: "stock",
    label: "Stock",
    icon: Boxes,
    items: [
      { to: "/imei", label: "IMEI Search", icon: ScanLine },
      { to: "/purchases", label: "Purchase", icon: ShoppingCart },
      { to: "/rma", label: "RMA", icon: RotateCcw },
    ],
  },
  {
    key: "billing",
    label: "Billing",
    icon: Receipt,
    items: [
      { to: "/sales", label: "Sale", icon: ReceiptText },
      { to: "/returns", label: "Return", icon: Undo2 },
      { to: "/warranty", label: "Warranty", icon: ShieldCheck },
    ],
  },
];

const REPORTS_LINK: NavItem = { to: "/reports", label: "Reports", icon: BarChart3 };

const GENERAL_GROUP: NavGroup = {
  key: "general",
  label: "General",
  icon: LayoutGrid,
  items: [
    { to: "/customers", label: "Customer", icon: Users },
    { to: "/suppliers", label: "Supplier", icon: Truck },
    { to: "/products", label: "Products", icon: Package },
    { to: "/sims", label: "SIM Management", icon: Smartphone },
    { to: "/vehicles", label: "Vehicle", icon: Car },
    { to: "/installations", label: "Installation", icon: Wrench },
    { to: "/files", label: "Files", icon: FileText },
  ],
};

const ADMIN_GROUP: NavGroup = {
  key: "admin",
  label: "Admin",
  icon: ShieldAlert,
  items: [
    { to: "/users", label: "Users", icon: UserCog },
    { to: "/audit-logs", label: "Audit Logs", icon: History },
    { to: "/activity-report", label: "Activity Report", icon: Activity },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
    { to: "/backup", label: "Backup & Restore", icon: DatabaseBackup },
    { to: "/branches", label: "Branches", icon: Building2 },
  ],
};

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted",
    isActive ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground"
  );
}

function groupMatches(group: NavGroup, pathname: string) {
  return group.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(() => groupMatches(group, pathname));
  const GroupIcon = group.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
      >
        <GroupIcon size={16} className="shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-xs text-muted-foreground/70">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="ml-2 flex flex-col gap-1 border-l border-border pl-2">
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={15} className="shrink-0" />
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
      <aside className="w-60 shrink-0 border-r border-border bg-card p-3.5 flex flex-col gap-1 overflow-y-auto">
        <div className="mb-4 flex items-center gap-2.5 px-1 pt-0.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary">
            <div className="h-2.5 w-2.5 rounded-[3px] bg-primary-foreground" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-tight leading-tight">Alphatech</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 leading-tight">
              {user?.role ?? "Workspace"}
            </p>
          </div>
        </div>

        {TOP_LINKS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
            <item.icon size={16} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}

        {NAV_GROUPS.map((group) => (
          <NavGroupSection key={group.key} group={group} pathname={pathname} />
        ))}

        <NavLink to={REPORTS_LINK.to} className={linkClass}>
          <REPORTS_LINK.icon size={16} className="shrink-0" />
          {REPORTS_LINK.label}
        </NavLink>

        <NavGroupSection group={GENERAL_GROUP} pathname={pathname} />

        {user?.role === "ADMIN" && <NavGroupSection group={ADMIN_GROUP} pathname={pathname} />}

        <div className="mt-auto border-t border-border pt-3">
          <div className="flex items-center gap-2 px-1 pb-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
              {user?.email?.charAt(0).toUpperCase() ?? "A"}
            </div>
            <p className="truncate text-xs text-muted-foreground/80">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" className="w-full font-bold" onClick={handleLogout}>
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
