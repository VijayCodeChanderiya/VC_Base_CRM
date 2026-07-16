import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";

interface DetailResponse {
  type: string;
  title: string;
  columns: string[];
  rows: string[][];
  summaryColumns?: string[];
  summaryRows?: string[][];
}

function DetailTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No records found.</p>;
  }
  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="p-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="p-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardDetailModal({
  type,
  branchId,
  onClose,
}: {
  type: string | null;
  branchId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-detail", type, branchId],
    queryFn: async () =>
      (await api.get("/dashboard/detail", { params: { type, branchId } })).data as DetailResponse,
    enabled: !!type,
  });

  return (
    <Modal open={!!type} onClose={onClose} title={data?.title ?? "Details"} size="xl">
      {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading...</p>}
      {data && (
        <div className="flex flex-col gap-4">
          {data.summaryColumns && data.summaryRows && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Summary</p>
              <DetailTable columns={data.summaryColumns} rows={data.summaryRows} />
            </div>
          )}
          <div>
            {data.summaryColumns && (
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Issued / Sold devices</p>
            )}
            <DetailTable columns={data.columns} rows={data.rows} />
          </div>
        </div>
      )}
    </Modal>
  );
}
