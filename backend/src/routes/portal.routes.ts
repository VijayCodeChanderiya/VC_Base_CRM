import { Router } from "express";
import { authenticateCustomer } from "@/middleware/customerAuth";
import {
  getMyProfile,
  listMySales,
  getMySale,
  exportMySalesCsv,
  exportMySalesPdf,
  listMyWarrantyClaims,
  listMyReturns,
  updateMyAccount,
} from "@/controllers/portal.controller";

const router = Router();

router.use(authenticateCustomer);
router.get("/me", getMyProfile);
router.patch("/account", updateMyAccount);
router.get("/sales/export.csv", exportMySalesCsv);
router.get("/sales/export.pdf", exportMySalesPdf);
router.get("/sales", listMySales);
router.get("/sales/:id", getMySale);
router.get("/warranty", listMyWarrantyClaims);
router.get("/returns", listMyReturns);

export default router;
