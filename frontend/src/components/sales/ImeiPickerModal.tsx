import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface ImeiOption {
  id: string;
  imei: string;
}

export function ImeiPickerModal({
  open,
  onClose,
  productId,
  productName,
  branchId,
  initialSelected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  productName?: string;
  branchId: string | null;
  initialSelected: string[];
  onConfirm: (imeis: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  const { data, isLoading } = useQuery({
    queryKey: ["imei-list", "picker", productId, branchId],
    queryFn: async () =>
      (
        await api.get("/imei", {
          params: { productId, branchId, status: "IN_STOCK", pageSize: 1000 },
        })
      ).data as { items: ImeiOption[] },
    enabled: open && !!productId && !!branchId,
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    return items.filter((i) => i.imei.includes(search.trim()));
  }, [data, search]);

  function toggle(imei: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(imei)) next.delete(imei);
      else next.add(imei);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) next.add(item.imei);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleConfirm() {
    onConfirm([...selected]);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Select IMEIs${productName ? ` — ${productName}` : ""}`} size="lg">
      <div className="flex flex-col gap-3">
        <Input
          placeholder="Search IMEI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {selected.size} selected · {filtered.length} in stock{search ? " (filtered)" : ""}
          </span>
          <div className="flex gap-3">
            <button type="button" className="text-primary hover:underline" onClick={selectAllFiltered}>
              Select all {search ? "filtered" : ""}
            </button>
            <button type="button" className="text-primary hover:underline" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No in-stock IMEIs found for this product.</p>
          )}
          {filtered.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 px-3 py-2 text-sm font-mono hover:bg-muted cursor-pointer"
            >
              <input type="checkbox" checked={selected.has(item.imei)} onChange={() => toggle(item.imei)} />
              {item.imei}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Use {selected.size} device(s)</Button>
        </div>
      </div>
    </Modal>
  );
}
