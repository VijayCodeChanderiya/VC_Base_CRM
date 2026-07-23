import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DangerZone } from "@/components/ui/DangerZone";

type FeatureType = "BOOLEAN" | "LIMIT";

interface Feature {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: FeatureType;
}

export function Features() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FeatureType>("BOOLEAN");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Feature | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["features"],
    queryFn: async () => (await api.get("/platform/features", { params: { pageSize: 100 } })).data as { items: Feature[] },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post("/platform/features", { key, label, description: description || undefined, type }),
    onSuccess: () => {
      setKey("");
      setLabel("");
      setDescription("");
      setType("BOOLEAN");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create feature"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/platform/features/${deleteTarget!.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Features</h1>
        <Button onClick={() => setAddOpen(true)}>+ New feature</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Feature catalog</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">Key</th>
                <th className="p-3">Label</th>
                <th className="p-3">Type</th>
                <th className="p-3">Description</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              )}
              {data?.items.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono text-xs">{f.key}</td>
                  <td className="p-3">{f.label}</td>
                  <td className="p-3">{f.type}</td>
                  <td className="p-3 text-muted-foreground">{f.description ?? "-"}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(f)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete feature">
        {deleteTarget && (
          <DangerZone
            label="feature"
            confirmText={deleteTarget.key}
            onDelete={() => deleteMutation.mutate()}
            isDeleting={deleteMutation.isPending}
            error={
              deleteMutation.isError
                ? (deleteMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                  "Failed to delete feature"
                : null
            }
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New feature">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Key (camelCase, e.g. maxBranches)</label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as FeatureType)}
            >
              <option value="BOOLEAN">Boolean (on/off)</option>
              <option value="LIMIT">Limit (numeric ceiling)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!key || !label || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Create feature"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
