import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers,
} from "@/controllers/supplier.controller";

const router = Router();

router.use(authenticate);
router.get("/", listSuppliers);
router.get("/:id", getSupplier);
router.post("/", authorize("ADMIN", "STAFF"), createSupplier);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteSuppliers);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateSupplier);
router.delete("/:id", authorize("ADMIN"), deleteSupplier);

export default router;
