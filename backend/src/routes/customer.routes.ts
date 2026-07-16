import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  bulkDeleteCustomers,
} from "@/controllers/customer.controller";

const router = Router();

router.use(authenticate);
router.get("/", listCustomers);
router.get("/:id", getCustomer);
router.post("/", authorize("ADMIN", "STAFF"), createCustomer);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteCustomers);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateCustomer);
router.delete("/:id", authorize("ADMIN"), deleteCustomer);

export default router;
