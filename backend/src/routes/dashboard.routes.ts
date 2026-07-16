import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { getDashboardStats, getPurchaseTrend, getDashboardDetail } from "@/controllers/dashboard.controller";

const router = Router();

router.use(authenticate);
router.get("/stats", getDashboardStats);
router.get("/purchase-trend", getPurchaseTrend);
router.get("/detail", getDashboardDetail);

export default router;
