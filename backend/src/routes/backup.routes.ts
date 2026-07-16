import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { createBackup, listBackups, downloadBackup } from "@/controllers/backup.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN"));
router.get("/", listBackups);
router.post("/", createBackup);
router.get("/:filename/download", downloadBackup);

export default router;
