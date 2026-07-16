import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThemeStore, type Theme } from "@/store/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; description: string; swatch: string }[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright theme with a blue accent",
    swatch: "linear-gradient(90deg, #eff6ff, #2563eb)",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-light theme",
    swatch: "linear-gradient(90deg, #0b0f19, #6366f1)",
  },
];

interface CompanyProfile {
  companyName: string;
  address: string;
  gstNumber: string;
  currency: string;
  phone: string;
}

const DEFAULT_PROFILE: CompanyProfile = {
  companyName: "",
  address: "",
  gstNumber: "",
  currency: "INR",
  phone: "",
};

export function Settings() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoCacheBust, setLogoCacheBust] = useState(0);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get("/settings")).data as Record<string, unknown>,
  });

  const { data: branding } = useQuery({
    queryKey: ["public-branding"],
    queryFn: async () => (await api.get("/public/branding")).data as { hasLogo: boolean; companyName: string },
  });

  useEffect(() => {
    if (data?.companyProfile) {
      setProfile({ ...DEFAULT_PROFILE, ...(data.companyProfile as Partial<CompanyProfile>) });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => api.put("/settings/companyProfile", { value: profile }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", "Branding");
      form.append("entityId", "logo");
      return api.post("/files", form);
    },
    onSuccess: () => {
      setLogoError(null);
      setLogoCacheBust((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["public-branding"] });
    },
    onError: (err: unknown) => {
      setLogoError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Upload failed");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex w-44 flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors",
                theme === opt.value ? "border-primary ring-2 ring-primary" : "border-border hover:bg-muted"
              )}
            >
              <span className="h-8 w-full rounded" style={{ background: opt.swatch }} />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Company name</label>
              <Input
                value={profile.companyName}
                onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                Phone (used for the portal&apos;s WhatsApp help button)
              </label>
              <Input
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="91XXXXXXXXXX"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Address</label>
              <Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">GST number</label>
              <Input
                value={profile.gstNumber}
                onChange={(e) => setProfile({ ...profile, gstNumber: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Currency</label>
              <Input
                value={profile.currency}
                onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={saveMutation.isPending} className="w-fit">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {saved && <p className="text-sm text-primary">Saved.</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Logo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          {branding?.hasLogo ? (
            <img
              key={logoCacheBust}
              src={`/api/public/branding/logo?v=${logoCacheBust}`}
              alt="Company logo"
              className="h-16 w-16 rounded-md border border-border object-contain bg-card"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              No logo
            </div>
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) logoUploadMutation.mutate(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Shown on every customer portal page. Recommended: square image, under 1MB.
            </p>
            {logoUploadMutation.isPending && <p className="text-xs text-muted-foreground">Uploading...</p>}
            {logoError && <p className="text-xs text-destructive">{logoError}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
