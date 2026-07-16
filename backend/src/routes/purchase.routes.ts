import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listPurchases,
  getPurchase,
  createPurchase,
  deletePurchase,
  bulkDeletePurchases,
} from "@/controllers/purchase.controller";

const router = Router();

router.use(authenticate);
router.get("/", listPurchases);
router.get("/:id", getPurchase);
router.post("/", authorize("ADMIN", "STAFF"), createPurchase);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeletePurchases);
router.delete("/:id", authorize("ADMIN"), deletePurchase);

export default router;
