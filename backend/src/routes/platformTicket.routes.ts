import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listMyOrgTickets,
  getMyOrgTicket,
  createOrgTicket,
  replyToMyOrgTicket,
  closeMyOrgTicket,
} from "@/controllers/platformTicket.controller";

const router = Router();

// Any tenant staff (not SUPER_ADMIN, who has no organizationId) can raise/track platform tickets.
router.use(authenticate, authorize("ADMIN", "STAFF", "COMPANY", "RESELLER"));
router.get("/", listMyOrgTickets);
router.post("/", createOrgTicket);
router.get("/:id", getMyOrgTicket);
router.post("/:id/messages", replyToMyOrgTicket);
router.post("/:id/close", closeMyOrgTicket);

export default router;
