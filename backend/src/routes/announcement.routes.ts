import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  bulkDeleteAnnouncements,
} from "@/controllers/announcement.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN", "STAFF"), requireOrgContext);
router.get("/", listAnnouncements);
router.post("/", createAnnouncement);
router.patch("/:id", updateAnnouncement);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteAnnouncements);
router.delete("/:id", authorize("ADMIN"), deleteAnnouncement);

export default router;
