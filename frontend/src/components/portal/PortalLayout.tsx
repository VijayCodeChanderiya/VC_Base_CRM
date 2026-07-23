import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  Smartphone,
  Wifi,
  Package,
  Layers,
  Receipt,
  Undo2,
  ShieldCheck,
  LifeBuoy,
  MessageSquare,
  AlertTriangle,
  Wrench,
  User,
  Menu,
  X,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useCustomerAuthStore } from "@/store/customerAuth";
import { cn } from "@/lib/utils";
import { CompanyBrand } from "@/components/portal/CompanyBrand";
import { WhatsAppHelpButton } from "@/components/portal/WhatsAppHelpButton";
import { PortalNotificationBell } from "@/components/portal/PortalNotificationBell";
import { PortalAnnouncementBanner } from "@/components/portal/PortalAnnouncementBanner";

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

const DASHBOARD_ITEM: NavItem = { to: "/portal", label: "Dashboard", icon: LayoutDashboard };

const NAV_GROUPS: NavGroup[] = [
  {
    key: "inventory",
    label: "Inventory",
    icon: Boxes,
    items: [
      { to: "/portal/devices", label: "Devices", icon: Smartphone },
      { to: "/portal/sims", label: "SIM Management", icon: Wifi },
      { to: "/portal/products", label: "Products", icon: Package },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Layers,
    items: [
      { to: "/portal/purchases", label: "Purchases", icon: Receipt },
      { to: "/portal/returns", label: "Returns", icon: Undo2 },
      { to: "/portal/warranty", label: "Warranty & AMC", icon: ShieldCheck },
    ],
  },
  {
    key: "support",
    label: "Support",
    icon: LifeBuoy,
    items: [
      { to: "/portal/tickets", label: "Support Tickets", icon: MessageSquare },
      { to: "/portal/complaints", label: "Complaints", icon: AlertTriangle },
      { to: "/portal/service-requests", label: "Service Requests", icon: Wrench },
    ],
  },
];

const ACCOUNT_ITEMS: NavItem[] = [{ to: "/portal/account", label: "Profile", icon: User }];

function isItemActive(pathname: string, to: string) {
  return to === "/portal" ? pathname === "/portal" : pathname === to || pathname.startsWith(`${to}/`);
}

function groupIsActive(group: NavGroup, pathname: string) {
  return group.items.some((item) => isItemActive(pathname, item.to));
}

function pillClass(active: boolean) {
  return cn(
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    "hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    active ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground"
  );
}

function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));
  const active = groupIsActive(group, pathname);
  const GroupIcon = group.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={pillClass(active)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <GroupIcon size={16} />
        {group.label}
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-40 mt-2 w-56 rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted outline-none focus-visible:bg-muted",
                  isActive ? "font-semibold text-primary" : "text-foreground"
                )
              }
            >
              <item.icon size={16} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, onLogout }: { name?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));
  const initial = (name ?? "C").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {initial}
        </span>
        <span className="hidden max-w-[9rem] truncate font-medium sm:inline">{name ?? "Account"}</span>
        <ChevronDown size={14} className={cn("hidden transition-transform sm:inline", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {ACCOUNT_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted outline-none focus-visible:bg-muted",
                  isActive ? "font-semibold text-primary" : "text-foreground"
                )
              }
            >
              <item.icon size={16} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-destructive hover:bg-muted outline-none focus-visible:bg-muted"
          >
            <LogOut size={16} className="shrink-0" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function MobileNavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/portal"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
              isActive ? "bg-primary/10 text-primary" : "text-foreground"
            )
          }
        >
          <item.icon size={17} className="shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export function PortalLayout() {
  const { customer, logout } = useCustomerAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  function handleLogout() {
    logout();
    navigate("/portal/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <CompanyBrand size="sm" />
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            <NavLink to={DASHBOARD_ITEM.to} end className={({ isActive }) => pillClass(isActive)}>
              <DASHBOARD_ITEM.icon size={16} className="shrink-0" />
              {DASHBOARD_ITEM.label}
            </NavLink>
            {NAV_GROUPS.map((group) => (
              <NavDropdown key={group.key} group={group} pathname={pathname} />
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <PortalNotificationBell />
            <div className="hidden sm:block">
              <UserMenu name={customer?.name} onLogout={handleLogout} />
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary hover:opacity-90 sm:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Account menu"
            >
              {(customer?.name ?? "C").charAt(0).toUpperCase()}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="max-h-[calc(100vh-56px)] overflow-y-auto border-t border-border px-3 py-2 lg:hidden">
            <nav className="flex flex-col gap-1">
              <MobileNavSection title="Overview" items={[DASHBOARD_ITEM]} />
              {NAV_GROUPS.map((group) => (
                <MobileNavSection key={group.key} title={group.label} items={group.items} />
              ))}
              <MobileNavSection title="Account" items={ACCOUNT_ITEMS} />
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-muted"
              >
                <LogOut size={17} className="shrink-0" />
                Logout
              </button>
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto flex max-w-6xl w-full flex-col gap-4">
          <PortalAnnouncementBanner />
          <Outlet />
        </div>
      </main>
      <WhatsAppHelpButton />
    </div>
  );
}
