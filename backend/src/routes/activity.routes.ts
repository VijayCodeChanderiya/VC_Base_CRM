import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listActivity, exportActivityCsv } from "@/controllers/report.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN"));
router.get("/", listActivity);
router.get("/export.csv", exportActivityCsv);

export default router;
