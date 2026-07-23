import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

type FeatureType = "BOOLEAN" | "LIMIT";

interface Feature {
  id: string;
  key: string;
  label: string;
  type: FeatureType;
}

interface PlanFeature {
  featureId: string;
  boolValue: boolean | null;
  numValue: number | null;
  feature: Feature;
}

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  planFeatures: PlanFeature[];
  _count: { organizations: number };
}

export function Plans() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/platform/plans", { params: { pageSize: 100 } })).data as { items: Plan[] },
  });

  const { data: featuresData } = useQuery({
    queryKey: ["features"],
    queryFn: async () => (await api.get("/platform/features", { params: { pageSize: 100 } })).data as { items: Feature[] },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post("/platform/plans", { name, code }),
    onSuccess: () => {
      setName("");
      setCode("");
      setError(null);
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create plan"
      );
    },
  });

  const editingPlan = data?.items.find((p) => p.id === editingPlanId) ?? null;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Plans</h1>
        <Button onClick={() => setAddOpen(true)}>+ New plan</Button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader>
          <CardTitle>Plan catalog</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Code</th>
                <th className="p-3">Organizations</th>
                <th className="p-3">Active</th>
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
              {data?.items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 font-mono text-xs">{p.code}</td>
                  <td className="p-3">{p._count.organizations}</td>
                  <td className="p-3">{p.isActive ? "Yes" : "No"}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setEditingPlanId(p.id)}>
                      Edit features
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New plan">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Plan name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Code (e.g. STARTER, PRO)</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!name || !code || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Create plan"}
          </Button>
        </form>
      </Modal>

      {editingPlan && (
        <PlanFeatureEditor
          plan={editingPlan}
          allFeatures={featuresData?.items ?? []}
          onClose={() => setEditingPlanId(null)}
        />
      )}
    </div>
  );
}

function PlanFeatureEditor({
  plan,
  allFeatures,
  onClose,
}: {
  plan: Plan;
  allFeatures: Feature[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const initial: Record<string, { boolValue: boolean | null; numValue: number | null }> = {};
  for (const f of allFeatures) {
    const existing = plan.planFeatures.find((pf) => pf.featureId === f.id);
    initial[f.id] = { boolValue: existing?.boolValue ?? false, numValue: existing?.numValue ?? null };
  }
  const [values, setValues] = useState(initial);

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.put(`/platform/plans/${plan.id}/features`, {
        features: allFeatures.map((f) => ({
          featureId: f.id,
          boolValue: values[f.id].boolValue,
          numValue: values[f.id].numValue,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Features — ${plan.name}`}>
      <div className="flex flex-col gap-3">
        {allFeatures.length === 0 && (
          <p className="text-sm text-muted-foreground">No features in the catalog yet — add some first.</p>
        )}
        {allFeatures.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{f.key}</p>
            </div>
            {f.type === "BOOLEAN" ? (
              <input
                type="checkbox"
                checked={values[f.id]?.boolValue ?? false}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.id]: { ...v[f.id], boolValue: e.target.checked } }))
                }
              />
            ) : (
              <Input
                type="number"
                className="w-28"
                placeholder="Unlimited"
                value={values[f.id]?.numValue ?? ""}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [f.id]: { ...v[f.id], numValue: e.target.value === "" ? null : Number(e.target.value) },
                  }))
                }
              />
            )}
          </div>
        ))}
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || allFeatures.length === 0}>
          {saveMutation.isPending ? "Saving..." : "Save features"}
        </Button>
      </div>
    </Modal>
  );
}
