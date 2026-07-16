export function SortableTh({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  columnKey: string;
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sortKey === columnKey;
  return (
    <th className={className ?? "p-3"}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex items-center gap-1 select-none hover:text-foreground"
      >
        {label}
        <span className="text-[10px] leading-none">{active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );
}
