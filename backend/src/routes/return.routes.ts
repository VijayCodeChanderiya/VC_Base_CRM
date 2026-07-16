import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listReturns,
  getReturn,
  createReturn,
  approveReturn,
  rejectReturn,
  deleteReturn,
  bulkDeleteReturns,
} from "@/controllers/return.controller";

const router = Router();

router.use(authenticate);
router.get("/", listReturns);
router.get("/:id", getReturn);
router.post("/", authorize("ADMIN", "STAFF"), createReturn);
router.patch("/:id/approve", authorize("ADMIN", "STAFF"), approveReturn);
router.patch("/:id/reject", authorize("ADMIN", "STAFF"), rejectReturn);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteReturns);
router.delete("/:id", authorize("ADMIN"), deleteReturn);

export default router;
