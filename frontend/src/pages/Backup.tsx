import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import { useTableSort } from "@/lib/useTableSort";
import { SortableTh } from "@/components/ui/SortableTh";

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Backup() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => (await api.get("/backups")).data as { items: BackupFile[] },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post("/backups"),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Backup failed");
    },
  });

  const { sorted: sortedBackups, sortKey, sortDir, toggleSort } = useTableSort(data?.items, {
    filename: (b) => b.filename,
    size: (b) => b.size,
    createdAt: (b) => b.createdAt,
  });

  async function download(filename: string) {
    const res = await api.get(`/backups/${filename}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Backup & Restore</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create backup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Runs pg_dump against the live database and saves a timestamped SQL file on the server.
          </p>
          <Button className="w-fit" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Backing up..." : "Create backup now"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restore</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Restoring overwrites the live database and cannot be undone, so it is not exposed as a one-click web
            action. Download the backup you want below, then run it from a terminal on the server:
          </p>
          <pre className="mt-2 rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
            cd backend{"\n"}npm run restore -- &lt;backup-filename.sql&gt; --confirm
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <SortableTh label="Filename" columnKey="filename" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Size" columnKey="size" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Created" columnKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={4}>
                    Loading...
                  </td>
                </tr>
              )}
              {sortedBackups.map((b) => (
                <tr key={b.filename} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono">{b.filename}</td>
                  <td className="p-3">{formatSize(b.size)}</td>
                  <td className="p-3">{formatDateTime(b.createdAt)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => download(b.filename)}>
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
