import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listFeatures, createFeature, updateFeature, deleteFeature } from "@/controllers/feature.controller";

const router = Router();

router.use(authenticate, authorize("SUPER_ADMIN"));
router.get("/", listFeatures);
router.post("/", createFeature);
router.patch("/:id", updateFeature);
router.delete("/:id", deleteFeature);

export default router;
