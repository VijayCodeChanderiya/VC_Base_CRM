import { Router } from "express";
import { claimAccount, portalLogin } from "@/controllers/portalAuth.controller";

const router = Router();

router.post("/claim", claimAccount);
router.post("/login", portalLogin);

export default router;