import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { verifyToken, JwtPayload } from "@/utils/jwt";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const ORG_CONTEXT_HEADER = "x-organization-id";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401);
  }

  const token = header.slice("Bearer ".length);
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }

  // SUPER_ADMIN has no organization of its own but can act "as" any organization by
  // sending X-Organization-Id — this is the only role allowed to override the org
  // scope every controller derives from req.user.organizationId. Regular staff always
  // keep the organizationId baked into their own JWT; this header is ignored for them.
  if (payload.role === "SUPER_ADMIN") {
    const requestedOrgId = req.headers[ORG_CONTEXT_HEADER];
    if (typeof requestedOrgId === "string" && requestedOrgId) {
      const org = await prisma.organization.findUnique({ where: { id: requestedOrgId }, select: { id: true } });
      if (!org) throw new AppError("Organization not found", 404);
      payload = { ...payload, organizationId: org.id };
    }
  }

  req.user = payload;
  next();
}

// Applied to org-scoped routers after authorize(). Regular staff always have an
// organizationId from their own JWT, so this never blocks them. SUPER_ADMIN only has
// one once it has picked an organization to act as (via X-Organization-Id, resolved in
// authenticate() above) — GET requests are still allowed through with no org selected
// (list/detail controllers use resolveOrgFilterMode() to show cross-org "platform view"
// data instead), but writes need a concrete org to attach the new/changed record to.
export function requireOrgContext(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET") return next();
  if (!req.user?.organizationId) {
    throw new AppError("Select an organization to create or modify its data", 400);
  }
  next();
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }
    // SUPER_ADMIN has unrestricted platform-wide access — it bypasses every
    // role gate. Per-organization data boundaries still apply via the
    // X-Organization-Id context resolved in authenticate() above.
    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError("Insufficient permissions", 403);
    }
    next();
  };
}
