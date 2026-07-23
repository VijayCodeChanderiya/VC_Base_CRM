import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers,
  downloadSupplierBulkTemplate,
  bulkUploadSuppliersFromExcel,
  supplierUploadMiddleware,
} from "@/controllers/supplier.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listSuppliers);
router.get("/bulk/template", authorize("ADMIN", "STAFF"), downloadSupplierBulkTemplate);
router.get("/:id", getSupplier);
router.post("/", authorize("ADMIN", "STAFF"), createSupplier);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteSuppliers);
router.post(
  "/bulk/upload",
  authorize("ADMIN", "STAFF"),
  supplierUploadMiddleware,
  bulkUploadSuppliersFromExcel
);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateSupplier);
router.delete("/:id", authorize("ADMIN"), deleteSupplier);

export default router;
