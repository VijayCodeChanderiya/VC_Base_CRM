import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listPayments,
  createPayment,
  deletePayment,
  bulkDeletePayments,
} from "@/controllers/payment.controller";

const router = Router();

router.use(authenticate);
router.get("/", listPayments);
router.post("/", authorize("ADMIN", "STAFF"), createPayment);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeletePayments);
router.delete("/:id", authorize("ADMIN"), deletePayment);

export default router;
