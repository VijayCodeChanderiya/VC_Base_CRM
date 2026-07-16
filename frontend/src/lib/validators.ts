export const PHONE_REGEX = /^\d{10}$/;
export const IMEI_REGEX = /^\d{15}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ICCID_REGEX = /^(?=.*[A-Za-z])[A-Za-z0-9]{20,21}$/;
export const M2M_NUMBER_REGEX = /^\d{13}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value.trim());
}

export function isValidImei(value: string): boolean {
  return IMEI_REGEX.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function isValidIccid(value: string): boolean {
  return ICCID_REGEX.test(value.trim());
}

export function isValidM2mNumber(value: string): boolean {
  return M2M_NUMBER_REGEX.test(value.trim());
}

export const PHONE_ERROR = "Contact number must be exactly 10 digits";
export const IMEI_ERROR = "IMEI must be exactly 15 digits";
export const EMAIL_ERROR = "Enter a valid email address (e.g. name@example.com)";
export const ICCID_ERROR = "ICCID must be 20-21 characters and include at least one letter";
export const M2M_NUMBER_ERROR = "M2M SIM number must be exactly 13 digits";
