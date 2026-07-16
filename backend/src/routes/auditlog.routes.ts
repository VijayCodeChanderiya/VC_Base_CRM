import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listAuditLogs } from "@/controllers/auditlog.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN"));
router.get("/", listAuditLogs);

export default router;
