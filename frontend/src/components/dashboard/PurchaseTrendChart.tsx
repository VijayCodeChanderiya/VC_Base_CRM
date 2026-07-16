import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LineChart } from "@/components/dashboard/LineChart";

type Period = "day" | "month" | "year";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

function formatLabel(period: Period) {
  return (label: string) => {
    if (period === "day") return new Date(label).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (period === "month") {
      const [year, month] = label.split("-");
      return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    }
    return label;
  };
}

export function PurchaseTrendChart({
  branchId,
  initialData,
}: {
  branchId: string | null;
  initialData?: { date: string; amount: number }[];
}) {
  const [period, setPeriod] = useState<Period>("day");

  const { data } = useQuery({
    queryKey: ["purchase-trend", branchId, period],
    queryFn: async () =>
      (await api.get("/dashboard/purchase-trend", { params: { branchId, period } })).data as {
        period: Period;
        data: { label: string; amount: number }[];
      },
    enabled: !!branchId && period !== "day",
  });

  const points =
    period === "day"
      ? (initialData ?? []).map((d) => ({ date: d.date, value: d.amount }))
      : (data?.data ?? []).map((d) => ({ date: d.label, value: d.amount }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              period === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases yet.</p>
      ) : (
        <LineChart data={points} formatLabel={formatLabel(period)} ariaLabel="Purchase trend" />
      )}
    </div>
  );
}
