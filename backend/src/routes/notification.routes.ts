import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { listNotifications, markNotificationRead } from "@/controllers/notification.controller";

const router = Router();

router.use(authenticate);
router.get("/", listNotifications);
router.patch("/:id/read", markNotificationRead);

export default router;
