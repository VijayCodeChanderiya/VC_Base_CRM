import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "@/routes/auth.routes";
import productRoutes from "@/routes/product.routes";
import imeiRoutes from "@/routes/imei.routes";
import customerRoutes from "@/routes/customer.routes";
import saleRoutes from "@/routes/sale.routes";
import supplierRoutes from "@/routes/supplier.routes";
import purchaseRoutes from "@/routes/purchase.routes";
import returnRoutes from "@/routes/return.routes";
import warrantyRoutes from "@/routes/warranty.routes";
import paymentRoutes from "@/routes/payment.routes";
import notificationRoutes from "@/routes/notification.routes";
import userRoutes from "@/routes/user.routes";
import auditlogRoutes from "@/routes/auditlog.routes";
import searchRoutes from "@/routes/search.routes";
import reportRoutes from "@/routes/report.routes";
import activityRoutes from "@/routes/activity.routes";
import settingsRoutes from "@/routes/settings.routes";
import fileRoutes from "@/routes/file.routes";
import backupRoutes from "@/routes/backup.routes";
import branchRoutes from "@/routes/branch.routes";
import simRoutes from "@/routes/sim.routes";
import vehicleRoutes from "@/routes/vehicle.routes";
import installationRoutes from "@/routes/installation.routes";
import rmaRoutes from "@/routes/rma.routes";
import dashboardRoutes from "@/routes/dashboard.routes";
import portalAuthRoutes from "@/routes/portalAuth.routes";
import portalRoutes from "@/routes/portal.routes";
import publicBrandingRoutes from "@/routes/publicBranding.routes";
import { errorHandler } from "@/middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
  app.use(express.json());
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/imei", imeiRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/sales", saleRoutes);
  app.use("/api/suppliers", supplierRoutes);
  app.use("/api/purchases", purchaseRoutes);
  app.use("/api/returns", returnRoutes);
  app.use("/api/warranty", warrantyRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/audit-logs", auditlogRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/activity", activityRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/backups", backupRoutes);
  app.use("/api/branches", branchRoutes);
  app.use("/api/sims", simRoutes);
  app.use("/api/vehicles", vehicleRoutes);
  app.use("/api/installations", installationRoutes);
  app.use("/api/rma", rmaRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/portal/auth", portalAuthRoutes);
  app.use("/api/portal", portalRoutes);
  app.use("/api/public", publicBrandingRoutes);

  app.use(errorHandler);

  return app;
}
