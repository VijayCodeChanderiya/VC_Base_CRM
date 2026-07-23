import { Request } from "express";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

// Resolves what organization scope a GET request should run under.
//  - Regular staff: always their own org (from the JWT) — never overridable.
//  - SUPER_ADMIN acting as an org (X-Organization-Id header, resolved in authenticate()):
//    scoped to that org, same as regular staff.
//  - SUPER_ADMIN in platform view (no org selected): scoped to whatever ?organizationId=
//    query param was passed, or undefined (no filter at all = every organization) if
//    none was passed. This is what powers the "Platform view" cross-org list pages.
// Returns undefined only when the caller is SUPER_ADMIN with nothing selected — every
// other case returns a real organization id, so callers can build `organizationId ? {...} : {}`.
export function resolveOrgFilterMode(req: Request): string | undefined {
  if (req.user!.role !== "SUPER_ADMIN") {
    return req.user!.organizationId!;
  }
  if (req.user!.organizationId) return req.user!.organizationId;
  const queryOrgId = req.query.organizationId;
  return typeof queryOrgId === "string" && queryOrgId ? queryOrgId : undefined;
}

export const ORG_SUMMARY_SELECT = { id: true, name: true, displayName: true } as const;

// Validates that a caller-supplied customerId/productId/supplierId actually belongs to
// the caller's own organization, before it's used as a FK on a new record (Sale,
// Purchase, Sim assignment, Vehicle, WarrantyClaim, ...). Without this, any authenticated
// user could link a record to another organization's customer/product/supplier just by
// knowing (or guessing) its id.

export async function assertCustomerInOrg(customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
}

export async function assertProductsInOrg(productIds: string[], organizationId: string) {
  if (productIds.length === 0) return;
  const uniqueIds = [...new Set(productIds)];
  const count = await prisma.product.count({ where: { id: { in: uniqueIds }, organizationId } });
  if (count !== uniqueIds.length) throw new AppError("One or more products not found", 404);
}

export async function assertSupplierInOrg(supplierId: string, organizationId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId } });
  if (!supplier) throw new AppError("Supplier not found", 404);
  return supplier;
}
