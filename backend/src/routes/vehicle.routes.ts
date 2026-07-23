import { Router } from "express";
import { authenticate, authorize, requireOrgContext } from "@/middleware/auth";
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  bulkDeleteVehicles,
} from "@/controllers/vehicle.controller";

const router = Router();

router.use(authenticate, requireOrgContext);
router.get("/", listVehicles);
router.get("/:id", getVehicle);
router.post("/", authorize("ADMIN", "STAFF"), createVehicle);
router.post("/bulk-delete", authorize("ADMIN"), bulkDeleteVehicles);
router.patch("/:id", authorize("ADMIN", "STAFF"), updateVehicle);
router.delete("/:id", authorize("ADMIN"), deleteVehicle);

export default router;
