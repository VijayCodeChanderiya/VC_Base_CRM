import ExcelJS from "exceljs";
import { AppError } from "@/utils/AppError";

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "");
  }
  return String(value).trim();
}

export function mapRowByHeader(
  headerRow: ExcelJS.Row,
  columns: { key: string; match: (normalizedHeader: string) => boolean }[]
): Record<string, number> {
  const columnIndex: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const normalized = normalizeHeader(cell.value);
    for (const col of columns) {
      if (!columnIndex[col.key] && col.match(normalized)) {
        columnIndex[col.key] = colNumber;
      }
    }
  });
  return columnIndex;
}

export async function loadWorkbookSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Could not read the uploaded file — please upload a valid .xlsx file", 422);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("The uploaded file has no sheets", 422);
  }
  return sheet;
}
