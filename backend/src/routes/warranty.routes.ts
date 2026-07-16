import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listWarrantyClaims,
  createWarrantyClaim,
  updateWarrantyClaim,
  deleteWarrantyClaim,
  bulkDeleteWarrantyClaims,
} from "@/controllers/warranty.controller";

const router = Router();

router.use(authenticate);
router.get("/", listWarrantyClaims);
router.post("/", authorize("ADMIN", "STAFF"), createWarrantyClaim);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateWarrantyClaim);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteWarrantyClaims);
router.delete("/:id", authorize("ADMIN"), deleteWarrantyClaim);

export default router;
