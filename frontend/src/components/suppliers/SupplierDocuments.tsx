import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface FileRecord {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupplierDocuments({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["files", "Supplier", supplierId],
    queryFn: async () =>
      (await api.get("/files", { params: { entityType: "Supplier", entityId: supplierId } })).data as {
        items: FileRecord[];
      },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", "Supplier");
      form.append("entityId", supplierId);
      return api.post("/files", form);
    },
    onSuccess: () => {
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["files", "Supplier", supplierId] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files", "Supplier", supplierId] }),
  });

  async function download(file: FileRecord) {
    const res = await api.get(`/files/${file.id}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
          }}
        />
        {uploadMutation.isPending && <p className="text-xs text-muted-foreground">Uploading...</p>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {isLoading && <p className="text-xs text-muted-foreground">Loading documents...</p>}
      {!isLoading && data?.items.length === 0 && (
        <p className="text-xs text-muted-foreground">No documents attached yet.</p>
      )}
      {data && data.items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.items.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                {f.filename} <span className="text-xs text-muted-foreground">({formatSize(f.size)})</span>
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => download(f)}>
                  Download
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(`Delete "${f.filename}"? This cannot be undone.`)) {
                      deleteMutation.mutate(f.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
