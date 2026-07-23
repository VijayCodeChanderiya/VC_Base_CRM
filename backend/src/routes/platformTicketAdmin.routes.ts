import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listPlatformTickets,
  getPlatformTicket,
  assignPlatformTicket,
  replyToPlatformTicket,
  updatePlatformTicketStatus,
} from "@/controllers/platformTicket.controller";

const router = Router();

router.use(authenticate, authorize("SUPER_ADMIN"));
router.get("/", listPlatformTickets);
router.get("/:id", getPlatformTicket);
router.patch("/:id/assign", assignPlatformTicket);
router.post("/:id/messages", replyToPlatformTicket);
router.patch("/:id/status", updatePlatformTicketStatus);

export default router;
