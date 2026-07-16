import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { salesReport, purchasesReport, inventoryReport } from "@/controllers/report.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN", "STAFF"));
router.get("/sales.csv", salesReport);
router.get("/purchases.csv", purchasesReport);
router.get("/inventory.csv", inventoryReport);

export default router;
