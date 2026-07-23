import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgProfileForm, type OrgProfileValues } from "@/components/platform/OrgProfileForm";

interface MyOrg extends OrgProfileValues {
  id: string;
  billingStatus: string;
  plan: { name: string; code: string } | null;
}

export function MyOrganization() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["my-organization"],
    queryFn: async () => (await api.get("/organization/me")).data as MyOrg,
  });

  const { data: branding } = useQuery({
    queryKey: ["my-org-branding"],
    queryFn: async () => (await api.get("/organization/me/branding")).data as { hasLogo: boolean },
  });

  const { data: logoUrl } = useQuery({
    queryKey: ["my-org-logo-full"],
    queryFn: async () => {
      const res = await api.get("/organization/me/branding/logo", { responseType: "blob" });
      return URL.createObjectURL(res.data as Blob);
    },
    enabled: !!branding?.hasLogo,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<OrgProfileValues>) => api.patch("/organization/me", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-organization"] });
      queryClient.invalidateQueries({ queryKey: ["my-org-branding"] });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "Organization");
      fd.append("entityId", org!.id);
      return api.post("/files", fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-org-branding"] });
      queryClient.invalidateQueries({ queryKey: ["my-org-logo-full"] });
      queryClient.invalidateQueries({ queryKey: ["my-org-logo"] });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => api.delete("/organization/me/branding/logo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-org-branding"] });
      queryClient.invalidateQueries({ queryKey: ["my-org-logo-full"] });
      queryClient.invalidateQueries({ queryKey: ["my-org-logo"] });
    },
  });

  if (isLoading || !org) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">My Organization</h1>
        <p className="text-sm text-muted-foreground">
          Manage your company profile and branding. Plan and billing are managed by Alphatech.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Plan &amp; Billing</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Current plan</p>
            <p className="font-medium">{org.plan?.name ?? "No plan assigned"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Billing status</p>
            <p className="font-medium">{org.billingStatus}</p>
          </div>
        </CardContent>
      </Card>

      <OrgProfileForm
        initial={org}
        hasLogo={!!branding?.hasLogo}
        logoUrl={logoUrl ?? null}
        isSaving={updateMutation.isPending}
        isUploadingLogo={uploadLogoMutation.isPending}
        isRemovingLogo={removeLogoMutation.isPending}
        onSaveProfile={(patch) => updateMutation.mutate(patch)}
        onUploadLogo={(file) => uploadLogoMutation.mutate(file)}
        onRemoveLogo={() => removeLogoMutation.mutate()}
      />
    </div>
  );
}
