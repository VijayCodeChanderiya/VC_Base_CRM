import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
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
import { Invoice } from "@/pages/Invoice";
import { ImeiTimeline } from "@/pages/ImeiTimeline";
import { PurchaseDetail } from "@/pages/PurchaseDetail";
import { PortalProtectedRoute } from "@/components/portal/PortalProtectedRoute";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLogin } from "@/pages/portal/PortalLogin";
import { PortalPurchases } from "@/pages/portal/PortalPurchases";
import { PortalInvoice } from "@/pages/portal/PortalInvoice";
import { PortalWarranty } from "@/pages/portal/PortalWarranty";
import { PortalReturns } from "@/pages/portal/PortalReturns";
import { PortalAccount } from "@/pages/portal/PortalAccount";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
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
              <Route path="/sales/:id/invoice" element={<Invoice />} />
              <Route path="/imei/:imei/timeline" element={<ImeiTimeline />} />
              <Route path="/purchases/:id" element={<PurchaseDetail />} />
            </Route>
          </Route>

          <Route path="/portal/login" element={<PortalLogin />} />
          <Route element={<PortalProtectedRoute />}>
            <Route element={<PortalLayout />}>
              <Route path="/portal" element={<PortalPurchases />} />
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
