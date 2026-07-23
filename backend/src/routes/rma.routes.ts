import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listRmas,
  createRma,
  shipRma,
  receiveRma,
  resolveRma,
  deleteRma,
  bulkDeleteRmas,
} from "@/controllers/rma.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listRmas);
router.post("/", authorize("ADMIN", "STAFF"), createRma);
router.patch("/:id/ship", authorize("ADMIN", "STAFF"), shipRma);
router.patch("/:id/receive", authorize("ADMIN", "STAFF"), receiveRma);
router.patch("/:id/resolve", authorize("ADMIN", "STAFF"), resolveRma);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteRmas);
router.delete("/:id", authorize("ADMIN"), deleteRma);

export default router;
