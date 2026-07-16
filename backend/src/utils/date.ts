function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a date-only value as DD-MM-YYYY for display in reports/exports. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Formats a timestamp as DD-MM-YYYY HH:MM (24-hour, local time) for display in reports/exports. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
