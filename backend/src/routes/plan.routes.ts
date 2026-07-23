import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listPlans, createPlan, updatePlan, setPlanFeatures, deletePlan } from "@/controllers/plan.controller";

const router = Router();

router.use(authenticate, authorize("SUPER_ADMIN"));
router.get("/", listPlans);
router.post("/", createPlan);
router.patch("/:id", updatePlan);
router.put("/:id/features", setPlanFeatures);
router.delete("/:id", deletePlan);

export default router;
