import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listSales,
  getSale,
  createSale,
  deleteSale,
  bulkDeleteSales,
  downloadSaleBulkTemplate,
  bulkUploadSalesFromExcel,
  saleUploadMiddleware,
} from "@/controllers/sale.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listSales);
router.get("/bulk/template", authorize("ADMIN", "STAFF", "RESELLER"), downloadSaleBulkTemplate);
router.get("/:id", getSale);
router.post("/", authorize("ADMIN", "STAFF", "RESELLER"), createSale);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteSales);
router.post("/bulk/upload", authorize("ADMIN", "STAFF", "RESELLER"), saleUploadMiddleware, bulkUploadSalesFromExcel);
router.delete("/:id", authorize("ADMIN"), deleteSale);

export default router;
