import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { globalSearch } from "@/controllers/search.controller";

const router = Router();

router.use(authenticate);
router.get("/", globalSearch);

export default router;
