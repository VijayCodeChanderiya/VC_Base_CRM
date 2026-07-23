import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listAmcContracts,
  getAmcContract,
  createAmcContract,
  updateAmcContract,
  renewAmcContract,
  deleteAmcContract,
  bulkDeleteAmcContracts,
} from "@/controllers/amc.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN", "STAFF"), requireOrgContext);
router.get("/", listAmcContracts);
router.post("/", createAmcContract);
router.get("/:id", getAmcContract);
router.patch("/:id", updateAmcContract);
router.patch("/:id/renew", renewAmcContract);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteAmcContracts);
router.delete("/:id", authorize("ADMIN"), deleteAmcContract);

export default router;
