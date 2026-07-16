import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listSales, getSale, createSale, deleteSale, bulkDeleteSales } from "@/controllers/sale.controller";

const router = Router();

router.use(authenticate);
router.get("/", listSales);
router.get("/:id", getSale);
router.post("/", authorize("ADMIN", "STAFF", "RESELLER"), createSale);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteSales);
router.delete("/:id", authorize("ADMIN"), deleteSale);

export default router;
