import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listInstallations,
  createInstallation,
  updateInstallationStatus,
  deleteInstallation,
  bulkDeleteInstallations,
} from "@/controllers/installation.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listInstallations);
router.post("/", authorize("ADMIN", "STAFF"), createInstallation);
router.patch("/:id/status", authorize("ADMIN", "STAFF"), updateInstallationStatus);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteInstallations);
router.delete("/:id", authorize("ADMIN"), deleteInstallation);

export default router;
