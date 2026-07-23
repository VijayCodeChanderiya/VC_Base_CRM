import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useRemoteSort } from "@/lib/useRemoteSort";
import { SortableTh } from "@/components/ui/SortableTh";
import { cn } from "@/lib/utils";
import { OrganizationCreateWizard } from "@/pages/platform/OrganizationCreateWizard";

type BillingStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

interface Organization {
  id: string;
  name: string;
  slug: string;
  billingStatus: BillingStatus;
  isActive: boolean;
  createdAt: string;
  plan: { id: string; name: string; code: string } | null;
  _count: { branches: number; users: number };
}

const STATUS_TONE: Record<BillingStatus, string> = {
  TRIAL: "bg-primary/10 text-primary",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PAST_DUE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  SUSPENDED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

interface OrganizationBulkResult {
  totalRows: number;
  created: { id: string; name: string; slug: string }[];
  failed: { row: number; reason: string }[];
}

export function Organizations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkFormError, setBulkFormError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<OrganizationBulkResult | null>(null);
  const [templateDownloading, setTemplateDownloading] = useState(false);

  const { sortKey, sortDir, toggleSort } = useRemoteSort(() => setPage(1));

  const { data, isLoading } = useQuery({
    queryKey: ["organizations", page, pageSize, sortKey, sortDir],
    queryFn: async () =>
      (await api.get("/platform/organizations", { params: { page, pageSize, sortBy: sortKey ?? undefined, sortDir } }))
        .data as { items: Organization[]; total: number; page: number; pageSize: number },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function closeBulkModal() {
    setBulkOpen(false);
    setBulkFile(null);
    setBulkResult(null);
    setBulkFormError(null);
  }

  async function downloadOrganizationTemplate(sample: boolean) {
    setTemplateDownloading(true);
    try {
      const res = await api.get("/platform/organizations/bulk/template", {
        params: sample ? { sample: 1 } : undefined,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = sample ? "Organizations sample file.xlsx" : "Organizations bulk upload template.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setTemplateDownloading(false);
    }
  }

  const bulkUploadMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", bulkFile!);
      return (await api.post("/platform/organizations/bulk/upload", form)).data as OrganizationBulkResult;
    },
    onSuccess: (result) => {
      setBulkResult(result);
      setBulkFile(null);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: unknown) => {
      setBulkFormError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to upload organizations"
      );
    },
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Organizations</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            Bulk Upload
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ New organization</Button>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="Name" columnKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3">Slug</th>
                <th className="p-3">Plan</th>
                <SortableTh
                  label="Billing status"
                  columnKey="billingStatus"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <th className="p-3">Branches</th>
                <th className="p-3">Users</th>
                <th className="p-3">Active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={8}>
                    Loading...
                  </td>
                </tr>
              )}
              {data?.items.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/platform/organizations/${o.id}`)}
                >
                  <td className="p-3 font-medium">{o.name}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{o.slug}</td>
                  <td className="p-3">{o.plan?.name ?? "-"}</td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[o.billingStatus])}>
                      {o.billingStatus}
                    </span>
                  </td>
                  <td className="p-3">{o._count.branches}</td>
                  <td className="p-3">{o._count.users}</td>
                  <td className="p-3">{o.isActive ? "Yes" : "No"}</td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/platform/organizations/${o.id}`);
                      }}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <select
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {data && data.total > 0
                ? `${(data.page - 1) * data.pageSize + 1}-${Math.min(data.page * data.pageSize, data.total)} (${data.total})`
                : "0-0 (0)"}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <OrganizationCreateWizard open={addOpen} onClose={() => setAddOpen(false)} />

      <Modal open={bulkOpen} onClose={closeBulkModal} title="Bulk Upload Organizations" size="lg">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Download the template, fill in one row per organization using the same fields as the "New organization"
            form, then upload the file below. Admin logins are not created here — add each organization's first
            admin user individually afterward, same as today. Rows with errors are reported individually so you can
            fix and re-upload just those.
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-muted-foreground">Excel file (.xlsx)</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={templateDownloading}
                onClick={() => downloadOrganizationTemplate(false)}
              >
                {templateDownloading ? "Downloading..." : "Download template"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={templateDownloading}
                onClick={() => downloadOrganizationTemplate(true)}
              >
                Download sample file
              </Button>
            </div>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBulkFormError(null);
              setBulkResult(null);
              if (!bulkFile) {
                setBulkFormError("Choose an Excel file to upload");
                return;
              }
              bulkUploadMutation.mutate();
            }}
          >
            <input
              type="file"
              accept=".xlsx"
              className="text-sm"
              onChange={(e) => {
                setBulkFile(e.target.files?.[0] ?? null);
                setBulkFormError(null);
              }}
            />
            {bulkFile && <p className="text-xs text-muted-foreground">Selected: {bulkFile.name}</p>}
            {bulkFormError && <p className="text-sm text-destructive">{bulkFormError}</p>}
            {bulkResult && (
              <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <p>Total rows processed: {bulkResult.totalRows}</p>
                <p className="text-emerald-600">Successfully imported: {bulkResult.created.length}</p>
                {bulkResult.failed.length > 0 && (
                  <>
                    <p className="text-destructive">Failed: {bulkResult.failed.length}</p>
                    <ul className="max-h-48 list-disc overflow-y-auto pl-4 text-xs text-muted-foreground">
                      {bulkResult.failed.map((f) => (
                        <li key={f.row} className="text-destructive">
                          Row {f.row}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <Button type="submit" disabled={bulkUploadMutation.isPending}>
              {bulkUploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
