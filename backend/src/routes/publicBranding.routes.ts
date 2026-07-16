import { Router } from "express";
import { getBranding, getBrandingLogo } from "@/controllers/publicBranding.controller";

const router = Router();

router.get("/branding", getBranding);
router.get("/branding/logo", getBrandingLogo);

export default router;
