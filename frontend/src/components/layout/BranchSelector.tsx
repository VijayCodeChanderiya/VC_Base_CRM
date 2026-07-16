import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBranchStore } from "@/store/branch";

interface Branch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function BranchSelector() {
  const { branchId, setBranchId } = useBranchStore();

  const { data } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get("/branches", { params: { pageSize: 100 } })).data as { items: Branch[] },
  });

  useEffect(() => {
    if (!branchId && data?.items.length) {
      const main = data.items.find((b) => b.code === "MAIN") ?? data.items[0];
      setBranchId(main.id);
    }
  }, [data, branchId, setBranchId]);

  if (!data?.items.length) return null;

  return (
    <select
      className="h-9 rounded-md border border-border bg-card px-2 text-sm"
      value={branchId ?? ""}
      onChange={(e) => setBranchId(e.target.value)}
    >
      {data.items.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} ({b.code})
        </option>
      ))}
    </select>
  );
}
