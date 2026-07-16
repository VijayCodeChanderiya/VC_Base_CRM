import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Contact number must be exactly 10 digits");

export const optionalPhoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Contact number must be exactly 10 digits")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const imeiSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "IMEI must be exactly 15 digits");

export const emailSchema = z.string().trim().email("Enter a valid email address");

export const optionalEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal("").transform(() => undefined));

// SIM ICCID: 20 or 21 character hardware identifier printed on the physical SIM card,
// alphanumeric with at least one letter (per this org's actual card stock).
export const iccidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(?=.*[A-Z])[A-Z0-9]{20,21}$/, "ICCID must be 20-21 characters and include at least one letter");

// M2M SIM number (different format from a regular 10-digit customer phone).
export const m2mNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{13}$/, "M2M SIM number must be exactly 13 digits");

export const optionalM2mNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{13}$/, "M2M SIM number must be exactly 13 digits")
  .optional()
  .or(z.literal("").transform(() => undefined));
