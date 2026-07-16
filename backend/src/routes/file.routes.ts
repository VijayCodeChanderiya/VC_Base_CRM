import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { uploadMiddleware, uploadFile, listFiles, downloadFile, deleteFile } from "@/controllers/file.controller";

const router = Router();

router.use(authenticate);
router.get("/", listFiles);
router.get("/:id/download", downloadFile);
router.post("/", authorize("ADMIN", "STAFF"), uploadMiddleware, uploadFile);
router.delete("/:id", authorize("ADMIN"), deleteFile);

export default router;
