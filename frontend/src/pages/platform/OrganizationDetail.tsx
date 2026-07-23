import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { OrgProfileForm, type OrgProfileValues } from "@/components/platform/OrgProfileForm";

type StaffRole = "ADMIN" | "STAFF" | "COMPANY" | "RESELLER";
const ROLE_OPTIONS: StaffRole[] = ["ADMIN", "STAFF", "COMPANY", "RESELLER"];

type BillingStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
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

interface Override {
  featureId: string;
  boolValue: boolean | null;
  numValue: number | null;
  feature: Feature;
}

interface OrgDetail extends OrgProfileValues {
  id: string;
  slug: string;
  billingStatus: BillingStatus;
  isActive: boolean;
  trialEndsAt: string | null;
  notes: string | null;
  hasLogo: boolean;
  plan: { id: string; name: string; planFeatures: PlanFeature[] } | null;
  featureOverrides: Override[];
  branches: { id: string; code: string; name: string; isActive: boolean }[];
  users: { id: string; name: string; email: string; role: string; isActive: boolean }[];
}

interface Plan {
  id: string;
  name: string;
}

const STATUS_OPTIONS: BillingStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"];

const emptyNewUser = { name: "", email: "", phone: "", password: "", role: "ADMIN" as StaffRole };

export function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", id],
    queryFn: async () => (await api.get(`/platform/organizations/${id}`)).data as OrgDetail,
  });

  const { data: logoUrl } = useQuery({
    queryKey: ["organization-logo", id],
    queryFn: async () => {
      const res = await api.get(`/platform/organizations/${id}/logo`, { responseType: "blob" });
      return URL.createObjectURL(res.data as Blob);
    },
    enabled: !!org?.hasLogo,
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans-lite"],
    queryFn: async () => (await api.get("/platform/plans", { params: { pageSize: 100 } })).data as { items: Plan[] },
  });

  const { data: featuresData } = useQuery({
    queryKey: ["features"],
    queryFn: async () => (await api.get("/platform/features", { params: { pageSize: 100 } })).data as { items: Feature[] },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => api.patch(`/platform/organizations/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", id] }),
  });

  const setOverrideMutation = useMutation({
    mutationFn: async (payload: { featureId: string; boolValue?: boolean | null; numValue?: number | null }) =>
      api.put(`/platform/organizations/${id}/overrides`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", id] }),
  });

  const resetOverrideMutation = useMutation({
    mutationFn: async (featureId: string) => api.delete(`/platform/organizations/${id}/overrides/${featureId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", id] }),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "Organization");
      fd.append("entityId", id!);
      return api.post("/files", fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", id] });
      queryClient.invalidateQueries({ queryKey: ["organization-logo", id] });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => api.delete(`/platform/organizations/${id}/logo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", id] });
      queryClient.invalidateQueries({ queryKey: ["organization-logo", id] });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async () =>
      api.post(`/platform/organizations/${id}/users`, {
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        phone: newUser.phone.trim() || undefined,
        password: newUser.password,
        role: newUser.role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", id] });
      setAddUserOpen(false);
      setNewUser(emptyNewUser);
      setAddUserError(null);
    },
    onError: (err: unknown) => {
      setAddUserError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create user"
      );
    },
  });

  if (isLoading || !org) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  const planFeatureByFeatureId = new Map(org.plan?.planFeatures.map((pf) => [pf.featureId, pf]) ?? []);
  const overrideByFeatureId = new Map(org.featureOverrides.map((o) => [o.featureId, o]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => navigate("/platform/organizations")}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{org.name}</h1>
          <p className="text-xs text-muted-foreground font-mono">{org.slug}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Billing & plan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Plan</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={org.plan?.id ?? ""}
                onChange={(e) => updateMutation.mutate({ planId: e.target.value || null })}
              >
                <option value="">No plan</option>
                {plansData?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Billing status</label>
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={org.billingStatus}
                onChange={(e) => updateMutation.mutate({ billingStatus: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Trial ends on</label>
              <Input
                type="date"
                value={org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : ""}
                onChange={(e) => updateMutation.mutate({ trialEndsAt: e.target.value || null })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={org.isActive}
                onChange={(e) => updateMutation.mutate({ isActive: e.target.checked })}
              />
              Active
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Branches & users</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddUserOpen(true)}>
              + Add user
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Branches ({org.branches.length})</p>
              {org.branches.map((b) => (
                <p key={b.id} className="text-sm">
                  {b.code} — {b.name}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Users ({org.users.length})</p>
              {org.users.length === 0 && (
                <p className="text-sm text-destructive">
                  No users yet — nobody can log into this organization. Add one.
                </p>
              )}
              {org.users.map((u) => (
                <p key={u.id} className="text-sm">
                  {u.name} ({u.role}) — {u.email}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={addUserOpen} onClose={() => setAddUserOpen(false)} title="Add user to this organization">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAddUserError(null);
            addUserMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} required autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Phone (optional)</label>
            <Input value={newUser.phone} onChange={(e) => setNewUser((u) => ({ ...u, phone: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
              placeholder="Min 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Role</label>
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={newUser.role}
              onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as StaffRole }))}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {addUserError && <p className="text-sm text-destructive">{addUserError}</p>}
          <Button type="submit" disabled={addUserMutation.isPending}>
            {addUserMutation.isPending ? "Creating..." : "Create user"}
          </Button>
        </form>
      </Modal>

      <OrgProfileForm
        initial={org}
        hasLogo={org.hasLogo}
        logoUrl={logoUrl ?? null}
        isSaving={updateMutation.isPending}
        isUploadingLogo={uploadLogoMutation.isPending}
        isRemovingLogo={removeLogoMutation.isPending}
        onSaveProfile={(patch) => updateMutation.mutate(patch)}
        onUploadLogo={(file) => uploadLogoMutation.mutate(file)}
        onRemoveLogo={() => removeLogoMutation.mutate()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Feature overrides</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Feature</th>
                <th className="px-4 py-2">Plan default</th>
                <th className="px-4 py-2">Override</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(featuresData?.items ?? []).map((f) => {
                const planDefault = planFeatureByFeatureId.get(f.id);
                const override = overrideByFeatureId.get(f.id);
                const planLabel =
                  f.type === "BOOLEAN"
                    ? planDefault?.boolValue
                      ? "On"
                      : "Off"
                    : planDefault?.numValue ?? "Unlimited";
                return (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      {f.label}
                      <span className="ml-1 text-xs text-muted-foreground font-mono">({f.key})</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{planLabel}</td>
                    <td className="px-4 py-2">
                      {f.type === "BOOLEAN" ? (
                        <input
                          type="checkbox"
                          checked={override?.boolValue ?? planDefault?.boolValue ?? false}
                          onChange={(e) =>
                            setOverrideMutation.mutate({ featureId: f.id, boolValue: e.target.checked })
                          }
                        />
                      ) : (
                        <Input
                          type="number"
                          className="w-28"
                          placeholder="Unlimited"
                          defaultValue={override?.numValue ?? undefined}
                          onBlur={(e) =>
                            setOverrideMutation.mutate({
                              featureId: f.id,
                              numValue: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {override && (
                        <Button size="sm" variant="ghost" onClick={() => resetOverrideMutation.mutate(f.id)}>
                          Reset to plan default
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {org.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{org.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
