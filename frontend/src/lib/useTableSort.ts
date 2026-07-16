import { useMemo, useState } from "react";

type SortDir = "asc" | "desc";
type SortValue = string | number | Date | null | undefined;
type Accessors<T> = Record<string, (item: T) => SortValue>;

export function useTableSort<T>(items: T[] | undefined, accessors: Accessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const list = items ?? [];
    if (!sortKey || !accessors[sortKey]) return list;
    const accessor = accessors[sortKey];
    const copy = [...list];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return -1;
      if (bv == null) return 1;
      if (av instanceof Date || bv instanceof Date) {
        return new Date(av).getTime() - new Date(bv).getTime();
      }
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return { sorted, sortKey, sortDir, toggleSort };
}
