import { useState } from "react";

type SortDir = "asc" | "desc";

/** Tracks sortBy/sortDir for a server-sorted table — sorting happens on the backend across the full dataset, not just the loaded page. */
export function useRemoteSort(onChange?: () => void) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    onChange?.();
  }

  return { sortKey, sortDir, toggleSort };
}
