// Standard manufacturer warranty period, from the sale date. Centralized here so the
// portal's device list and the sales export both compute expiry the same way.
export const WARRANTY_YEARS = 1;

export function computeWarrantyExpiry(saleDate: Date): Date {
  const expiry = new Date(saleDate);
  expiry.setFullYear(expiry.getFullYear() + WARRANTY_YEARS);
  return expiry;
}
