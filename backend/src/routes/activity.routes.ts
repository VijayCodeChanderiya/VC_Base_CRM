import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import { listActivity, exportActivityCsv } from "@/controllers/report.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN"), requireOrgContext);
router.get("/", listActivity);
router.get("/export.csv", exportActivityCsv);

export default router;
