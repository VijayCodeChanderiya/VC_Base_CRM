import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import {
  listOrganizations,
  getOrganization,
  getOrganizationLogo,
  deleteOrganizationLogo,
  createOrganization,
  createOrganizationUser,
  updateOrganization,
  upsertOrganizationOverride,
  deleteOrganizationOverride,
  getPlatformStats,
  downloadOrganizationBulkTemplate,
  bulkUploadOrganizationsFromExcel,
  organizationUploadMiddleware,
} from "@/controllers/organization.controller";

const router = Router();

router.use(authenticate, authorize("SUPER_ADMIN"));
router.get("/stats", getPlatformStats);
router.get("/bulk/template", downloadOrganizationBulkTemplate);
router.get("/", listOrganizations);
router.post("/", createOrganization);
router.post("/bulk/upload", organizationUploadMiddleware, bulkUploadOrganizationsFromExcel);
router.get("/:id", getOrganization);
router.get("/:id/logo", getOrganizationLogo);
router.delete("/:id/logo", deleteOrganizationLogo);
router.post("/:id/users", createOrganizationUser);
router.patch("/:id", updateOrganization);
router.put("/:orgId/overrides", upsertOrganizationOverride);
router.delete("/:orgId/overrides/:featureId", deleteOrganizationOverride);

export default router;
