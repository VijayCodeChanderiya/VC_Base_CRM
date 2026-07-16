import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listSettings, setSetting } from "@/controllers/settings.controller";

const router = Router();

router.use(authenticate);
router.get("/", listSettings);
router.put("/:key", authorize("ADMIN"), setSetting);

export default router;
