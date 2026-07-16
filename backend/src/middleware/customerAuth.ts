import { Request, Response, NextFunction } from "express";
import { verifyCustomerToken, CustomerJwtPayload } from "@/utils/jwt";
import { AppError } from "@/utils/AppError";

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerJwtPayload;
    }
  }
}

export function authenticateCustomer(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401);
  }

  const token = header.slice("Bearer ".length);
  try {
    req.customer = verifyCustomerToken(token);
    next();
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
}