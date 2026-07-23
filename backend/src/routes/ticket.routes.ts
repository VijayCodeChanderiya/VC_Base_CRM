import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import { listTickets, getTicket, assignTicket, replyToTicket, updateTicketStatus } from "@/controllers/ticket.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN", "STAFF"), requireOrgContext);
router.get("/", listTickets);
router.get("/:id", getTicket);
router.patch("/:id/assign", assignTicket);
router.post("/:id/messages", replyToTicket);
router.patch("/:id/status", updateTicketStatus);

export default router;
