import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
} from "@/controllers/product.controller";

const router = Router();

router.use(authenticate);
router.get("/", listProducts);
router.get("/:id", getProduct);
router.post("/", authorize("ADMIN", "STAFF"), createProduct);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteProducts);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateProduct);
router.delete("/:id", authorize("ADMIN"), deleteProduct);

export default router;
