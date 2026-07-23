import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listImeis,
  searchImei,
  createImei,
  updateImei,
  getImeiTimeline,
  deleteImei,
  bulkDeleteImeis,
} from "@/controllers/imei.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listImeis);
router.get("/:imei/timeline", getImeiTimeline);
router.get("/:imei", searchImei);
router.post("/", authorize("ADMIN", "STAFF"), createImei);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteImeis);
router.patch("/record/:id", authorize("ADMIN", "STAFF"), updateImei);
router.delete("/record/:id", authorize("ADMIN"), deleteImei);

export default router;
