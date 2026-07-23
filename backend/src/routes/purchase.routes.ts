import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listPurchases,
  getPurchase,
  createPurchase,
  deletePurchase,
  bulkDeletePurchases,
  downloadPurchaseBulkTemplate,
  bulkUploadPurchasesFromExcel,
  purchaseUploadMiddleware,
} from "@/controllers/purchase.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listPurchases);
router.get("/bulk/template", authorize("ADMIN", "STAFF"), downloadPurchaseBulkTemplate);
router.get("/:id", getPurchase);
router.post("/", authorize("ADMIN", "STAFF"), createPurchase);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeletePurchases);
router.post(
  "/bulk/upload",
  authorize("ADMIN", "STAFF"),
  purchaseUploadMiddleware,
  bulkUploadPurchasesFromExcel
);
router.delete("/:id", authorize("ADMIN"), deletePurchase);

export default router;
