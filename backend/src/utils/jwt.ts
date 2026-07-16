import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";
const PORTAL_JWT_EXPIRES_IN = process.env.PORTAL_JWT_EXPIRES_IN ?? "24h";

export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
  type: "staff";
}

export interface CustomerJwtPayload {
  sub: string;
  type: "customer";
}

export function signToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "staff" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  if (decoded.type !== "staff") {
    throw new Error("Not a staff token");
  }
  return decoded;
}

export function signCustomerToken(payload: Omit<CustomerJwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "customer" }, JWT_SECRET, {
    expiresIn: PORTAL_JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyCustomerToken(token: string): CustomerJwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as CustomerJwtPayload;
  if (decoded.type !== "customer") {
    throw new Error("Not a customer token");
  }
  return decoded;
}
