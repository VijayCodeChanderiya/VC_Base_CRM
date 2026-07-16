import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  bulkDeleteBranches,
} from "@/controllers/branch.controller";

const router = Router();

router.use(authenticate);
router.get("/", listBranches);
router.post("/", authorize("ADMIN"), createBranch);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteBranches);
router.patch("/:id", authorize("ADMIN"), updateBranch);
router.delete("/:id", authorize("ADMIN"), deleteBranch);

export default router;
