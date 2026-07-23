import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RequireRole } from "@/components/layout/RequireRole";
import { HomeRoute } from "@/components/layout/HomeRoute";
import { Login } from "@/pages/Login";
import { Products } from "@/pages/Products";
import { Imei } from "@/pages/Imei";
import { Customers } from "@/pages/Customers";
import { Sales } from "@/pages/Sales";
import { Suppliers } from "@/pages/Suppliers";
import { Purchases } from "@/pages/Purchases";
import { Returns } from "@/pages/Returns";
import { Warranty } from "@/pages/Warranty";
import { Users } from "@/pages/Users";
import { AuditLogs } from "@/pages/AuditLogs";
import { Reports } from "@/pages/Reports";
import { ActivityReport } from "@/pages/ActivityReport";
import { Settings } from "@/pages/Settings";
import { Files } from "@/pages/Files";
import { Backup } from "@/pages/Backup";
import { Branches } from "@/pages/Branches";
import { Sims } from "@/pages/Sims";
import { SimsByCustomer } from "@/pages/SimsByCustomer";
import { Vehicles } from "@/pages/Vehicles";
import { Installations } from "@/pages/Installations";
import { Rma } from "@/pages/Rma";
import { Tickets } from "@/pages/Tickets";
import { TicketDetail } from "@/pages/TicketDetail";
import { Amc } from "@/pages/Amc";
import { Announcements } from "@/pages/Announcements";
import { MyOrganization } from "@/pages/MyOrganization";
import { Organizations } from "@/pages/platform/Organizations";
import { OrganizationDetail } from "@/pages/platform/OrganizationDetail";
import { Plans } from "@/pages/platform/Plans";
import { Features } from "@/pages/platform/Features";
import { PlatformTicketsInbox } from "@/pages/platform/PlatformTicketsInbox";
import { PlatformTicketDetail } from "@/pages/platform/PlatformTicketDetail";
import { OrgTickets } from "@/pages/OrgTickets";
import { OrgTicketDetail } from "@/pages/OrgTicketDetail";
import { Invoice } from "@/pages/Invoice";
import { ImeiTimeline } from "@/pages/ImeiTimeline";
import { PurchaseDetail } from "@/pages/PurchaseDetail";
import { PortalProtectedRoute } from "@/components/portal/PortalProtectedRoute";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLogin } from "@/pages/portal/PortalLogin";
import { PortalDashboard } from "@/pages/portal/PortalDashboard";
import { PortalPurchases } from "@/pages/portal/PortalPurchases";
import { PortalInvoice } from "@/pages/portal/PortalInvoice";
import { PortalWarranty } from "@/pages/portal/PortalWarranty";
import { PortalReturns } from "@/pages/portal/PortalReturns";
import { PortalAccount } from "@/pages/portal/PortalAccount";
import { PortalProducts } from "@/pages/portal/PortalProducts";
import { PortalDevices } from "@/pages/portal/PortalDevices";
import { PortalSims } from "@/pages/portal/PortalSims";
import { PortalTickets } from "@/pages/portal/PortalTickets";
import { PortalTicketDetail } from "@/pages/portal/PortalTicketDetail";
import { PortalComingSoon } from "@/pages/portal/PortalComingSoon";
import { AlertTriangle, Wrench } from "lucide-react";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRoute />} />

              {/* Org-operational pages. SUPER_ADMIN can access these too, acting as
                  whichever organization it has selected (see OrgSelector). */}
              <Route element={<RequireRole allow={["ADMIN", "STAFF", "COMPANY", "RESELLER", "SUPER_ADMIN"]} />}>
                <Route path="/products" element={<Products />} />
                <Route path="/imei" element={<Imei />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/warranty" element={<Warranty />} />
                <Route path="/users" element={<Users />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/activity-report" element={<ActivityReport />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/files" element={<Files />} />
                <Route path="/backup" element={<Backup />} />
                <Route path="/branches" element={<Branches />} />
                <Route path="/sims" element={<Sims />} />
                <Route path="/sims/customer/:customerId" element={<SimsByCustomer />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/installations" element={<Installations />} />
                <Route path="/rma" element={<Rma />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/tickets/:id" element={<TicketDetail />} />
                <Route path="/amc" element={<Amc />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/my-organization" element={<MyOrganization />} />
                <Route path="/org-tickets" element={<OrgTickets />} />
                <Route path="/org-tickets/:id" element={<OrgTicketDetail />} />
                <Route path="/sales/:id/invoice" element={<Invoice />} />
                <Route path="/imei/:imei/timeline" element={<ImeiTimeline />} />
                <Route path="/purchases/:id" element={<PurchaseDetail />} />
              </Route>

              {/* Platform-level pages: cross-organization, SUPER_ADMIN only. */}
              <Route element={<RequireRole allow={["SUPER_ADMIN"]} />}>
                <Route path="/platform/organizations" element={<Organizations />} />
                <Route path="/platform/organizations/:id" element={<OrganizationDetail />} />
                <Route path="/platform/plans" element={<Plans />} />
                <Route path="/platform/features" element={<Features />} />
                <Route path="/platform/tickets" element={<PlatformTicketsInbox />} />
                <Route path="/platform/tickets/:id" element={<PlatformTicketDetail />} />
              </Route>
            </Route>
          </Route>

          <Route path="/portal/login" element={<PortalLogin />} />
          <Route element={<PortalProtectedRoute />}>
            <Route element={<PortalLayout />}>
              <Route path="/portal" element={<PortalDashboard />} />
              <Route path="/portal/purchases" element={<PortalPurchases />} />
              <Route path="/portal/products" element={<PortalProducts />} />
              <Route path="/portal/devices" element={<PortalDevices />} />
              <Route path="/portal/sims" element={<PortalSims />} />
              <Route path="/portal/tickets" element={<PortalTickets />} />
              <Route path="/portal/tickets/:id" element={<PortalTicketDetail />} />
              <Route
                path="/portal/complaints"
                element={<PortalComingSoon title="Complaints" icon={AlertTriangle} />}
              />
              <Route
                path="/portal/service-requests"
                element={<PortalComingSoon title="Service Requests" icon={Wrench} />}
              />
              <Route path="/portal/invoice/:id" element={<PortalInvoice />} />
              <Route path="/portal/warranty" element={<PortalWarranty />} />
              <Route path="/portal/returns" element={<PortalReturns />} />
              <Route path="/portal/account" element={<PortalAccount />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
