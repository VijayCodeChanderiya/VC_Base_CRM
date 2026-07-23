import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  getMyOrganization,
  getMyOrganizationBranding,
  getMyOrganizationLogo,
  deleteMyOrganizationLogo,
  updateMyOrganization,
} from "@/controllers/myOrganization.controller";

const router = Router();

router.use(authenticate);
router.get("/branding", getMyOrganizationBranding);
router.get("/branding/logo", getMyOrganizationLogo);
router.delete("/branding/logo", authorize("ADMIN"), deleteMyOrganizationLogo);
router.get("/", getMyOrganization);
router.patch("/", authorize("ADMIN"), updateMyOrganization);

export default router;
