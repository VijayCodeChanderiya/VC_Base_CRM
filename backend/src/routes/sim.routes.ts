import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listSims,
  getSimStats,
  createSim,
  bulkCreateSims,
  bulkUploadSimsFromExcel,
  downloadSimBulkTemplate,
  simUploadMiddleware,
  updateSim,
  assignSim,
  bulkAssignSims,
  renewSim,
  listSimRenewals,
  updateSimStatus,
  deleteSim,
  bulkDeleteSims,
  exportCustomerSimsExcel,
  exportCustomerSimsPdf,
} from "@/controllers/sim.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listSims);
router.get("/stats", getSimStats);
router.get("/bulk/template", downloadSimBulkTemplate);
router.get("/customer/:customerId/export.xlsx", exportCustomerSimsExcel);
router.get("/customer/:customerId/export.pdf", exportCustomerSimsPdf);
router.post("/", authorize("ADMIN", "STAFF"), createSim);
router.post("/bulk", authorize("ADMIN", "STAFF"), bulkCreateSims);
router.post("/bulk/upload", authorize("ADMIN", "STAFF"), simUploadMiddleware, bulkUploadSimsFromExcel);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteSims);
router.post("/bulk-assign", authorize("ADMIN", "STAFF"), bulkAssignSims);
router.get("/:id/renewals", listSimRenewals);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateSim);
router.patch("/:id/assign", authorize("ADMIN", "STAFF"), assignSim);
router.patch("/:id/status", authorize("ADMIN", "STAFF"), updateSimStatus);
router.patch("/:id/renew", authorize("ADMIN", "STAFF"), renewSim);
router.delete("/:id", authorize("ADMIN"), deleteSim);

export default router;
