import { Router } from "express";
import { authenticateCustomer } from "@/middleware/customerAuth";
import {
  getMyProfile,
  listMySales,
  getMySale,
  exportMySalesCsv,
  exportMySalesPdf,
  listMyWarrantyClaims,
  listMyReturns,
  updateMyAccount,
  getMyDashboard,
  getMyDashboardCharts,
  getMyDashboardDetail,
  listMyDevices,
  listMyProducts,
  listMySims,
  getMySimsExcel,
  getMySimsPdf,
  getMyReportExcel,
  getMyReportPdf,
} from "@/controllers/portal.controller";
import {
  listMyTickets,
  getMyTicket,
  createMyTicket,
  replyToMyTicket,
  closeMyTicket,
} from "@/controllers/ticket.controller";
import { listMyAmcContracts } from "@/controllers/amc.controller";
import { listMyAnnouncements } from "@/controllers/announcement.controller";
import { listMyNotifications, markMyNotificationRead } from "@/controllers/notification.controller";

const router = Router();

router.use(authenticateCustomer);
router.get("/me", getMyProfile);
router.patch("/account", updateMyAccount);
router.get("/dashboard", getMyDashboard);
router.get("/dashboard/charts", getMyDashboardCharts);
router.get("/dashboard/detail", getMyDashboardDetail);
router.get("/devices", listMyDevices);
router.get("/products", listMyProducts);
router.get("/sims/export.xlsx", getMySimsExcel);
router.get("/sims/export.pdf", getMySimsPdf);
router.get("/sims", listMySims);
router.get("/reports/export.xlsx", getMyReportExcel);
router.get("/reports/export.pdf", getMyReportPdf);
router.get("/sales/export.csv", exportMySalesCsv);
router.get("/sales/export.pdf", exportMySalesPdf);
router.get("/sales", listMySales);
router.get("/sales/:id", getMySale);
router.get("/warranty", listMyWarrantyClaims);
router.get("/returns", listMyReturns);
router.get("/tickets", listMyTickets);
router.post("/tickets", createMyTicket);
router.get("/tickets/:id", getMyTicket);
router.post("/tickets/:id/messages", replyToMyTicket);
router.post("/tickets/:id/close", closeMyTicket);
router.get("/amc", listMyAmcContracts);
router.get("/announcements", listMyAnnouncements);
router.get("/notifications", listMyNotifications);
router.patch("/notifications/:id/read", markMyNotificationRead);

export default router;
