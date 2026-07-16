import { useMemo, useState } from "react";

export function useRowSelection<T extends { id: string }>(items: T[] | undefined) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const ids = useMemo(() => items?.map((i) => i.id) ?? [], [items]);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSelected = ids.some((id) => selectedIds.has(id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }

  function clear() {
    setSelectedIds(new Set());
  }

  return { selectedIds, toggle, toggleAll, clear, allSelected, someSelected };
}
