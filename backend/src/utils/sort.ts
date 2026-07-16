import { Request } from "express";

/**
 * Builds a Prisma orderBy object from `sortBy`/`sortDir` query params, restricted to an
 * allowlist so callers can't sort/query-plan on arbitrary or relation-traversal fields.
 */
export function parseSortOrder<T extends Record<string, unknown>>(
  req: Request,
  fieldMap: Record<string, T>,
  fallback: T
): T {
  const sortBy = req.query.sortBy as string | undefined;
  const sortDir = req.query.sortDir === "desc" ? "desc" : "asc";
  if (!sortBy || !fieldMap[sortBy]) return fallback;
  return applyDir(fieldMap[sortBy], sortDir);
}

function applyDir<T extends Record<string, unknown>>(shape: T, dir: "asc" | "desc"): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    result[key] = typeof value === "object" && value !== null ? applyDir(value as Record<string, unknown>, dir) : dir;
  }
  return result as T;
}
