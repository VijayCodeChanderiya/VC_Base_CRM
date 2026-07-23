import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type FeatureType = "BOOLEAN" | "LIMIT";

interface Feature {
  id: string;
  key: string;
  label: string;
  type: FeatureType;
}

const INDUSTRY_OPTIONS = ["Automotive", "Logistics", "Retail", "Manufacturing", "Services", "Other"];
const BUSINESS_TYPE_OPTIONS = ["Proprietorship", "Partnership", "Private Limited", "LLP", "Other"];

const STEPS = ["Basic Information", "Admin Account", "Address", "Owner Details", "Feature Customization"] as const;

const emptyForm = {
  name: "",
  displayName: "",
  companyEmail: "",
  mobileNumber: "",
  alternateContactNumber: "",
  gstNumber: "",
  panNumber: "",
  cinNumber: "",
  website: "",
  industryType: "",
  businessType: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  ownerName: "",
  ownerDesignation: "",
  ownerEmail: "",
  ownerMobile: "",
};

function field(label: string, required = false) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      {required && <span className="text-destructive"> *</span>}
    </label>
  );
}

const emptyAdmin = { name: "", email: "", phone: "", password: "" };

export function OrganizationCreateWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [admin, setAdmin] = useState(emptyAdmin);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [featureValues, setFeatureValues] = useState<Record<string, { boolValue?: boolean; numValue?: number | null }>>({});
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: featuresData } = useQuery({
    queryKey: ["features"],
    queryFn: async () => (await api.get("/platform/features", { params: { pageSize: 100 } })).data as { items: Feature[] },
  });

  function update<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setStep(0);
    setForm(emptyForm);
    setAdmin(emptyAdmin);
    setLogoFile(null);
    setLogoPreview(null);
    setFeatureValues({});
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(form)) {
        payload[k] = v.trim() ? v.trim() : undefined;
      }
      const res = await api.post("/platform/organizations", payload);
      const org = res.data as { id: string };

      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        fd.append("entityType", "Organization");
        fd.append("entityId", org.id);
        await api.post("/files", fd);
      }

      if (admin.email.trim() && admin.password.trim()) {
        await api.post(`/platform/organizations/${org.id}/users`, {
          name: admin.name.trim() || "Admin",
          email: admin.email.trim(),
          phone: admin.phone.trim() || undefined,
          password: admin.password,
          role: "ADMIN",
        });
      }

      const touchedFeatures = Object.entries(featureValues);
      for (const [featureId, value] of touchedFeatures) {
        await api.put(`/platform/organizations/${org.id}/overrides`, { featureId, ...value });
      }

      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create organization"
      );
    },
  });

  const canAdvanceFromStep0 = form.name.trim().length >= 2;
  const adminComplete = !!admin.email.trim() && admin.password.trim().length >= 8;
  const adminEmpty = !admin.email.trim() && !admin.password.trim();
  const canAdvanceFromStep1 = adminEmpty || adminComplete;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Organization"
      size="xl"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}
              </div>
              <span className={cn("hidden text-xs sm:inline", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              {field("Organization Name", true)}
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              {field("Display Name")}
              <Input value={form.displayName} onChange={(e) => update("displayName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              {field("Company Logo")}
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-12 w-12 rounded-md border border-border object-contain bg-card" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                    No logo
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setLogoFile(f);
                      setLogoPreview(URL.createObjectURL(f));
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                  {logoFile ? "Change logo" : "Upload logo"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {field("Company Email")}
              <Input type="email" value={form.companyEmail} onChange={(e) => update("companyEmail", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Mobile Number")}
              <Input value={form.mobileNumber} onChange={(e) => update("mobileNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Alternate Contact Number")}
              <Input value={form.alternateContactNumber} onChange={(e) => update("alternateContactNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Website")}
              <Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" />
            </div>
            <div className="flex flex-col gap-1">
              {field("GST Number")}
              <Input value={form.gstNumber} onChange={(e) => update("gstNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("PAN Number")}
              <Input value={form.panNumber} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("CIN Number")}
              <Input value={form.cinNumber} onChange={(e) => update("cinNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Industry Type")}
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={form.industryType}
                onChange={(e) => update("industryType", e.target.value)}
              >
                <option value="">Select...</option>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              {field("Business Type")}
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={form.businessType}
                onChange={(e) => update("businessType", e.target.value)}
              >
                <option value="">Select...</option>
                {BUSINESS_TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Creates the organization's first login (ADMIN role) so someone can actually sign in. You can skip this
              and add users later from the organization's detail page, but the organization won't be usable until at
              least one user exists.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                {field("Admin Name")}
                <Input value={admin.name} onChange={(e) => setAdmin((a) => ({ ...a, name: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                {field("Admin Email")}
                <Input
                  type="email"
                  value={admin.email}
                  onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                {field("Phone")}
                <Input value={admin.phone} onChange={(e) => setAdmin((a) => ({ ...a, phone: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                {field("Password")}
                <Input
                  type="password"
                  value={admin.password}
                  onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))}
                  placeholder="Min 8 characters"
                />
              </div>
            </div>
            {(admin.email.trim() || admin.password.trim()) &&
              (!admin.email.trim() || !admin.password.trim() || admin.password.trim().length < 8) && (
                <p className="text-sm text-destructive">
                  To create the admin account, provide both an email and a password of at least 8 characters.
                </p>
              )}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              {field("Address Line 1")}
              <Input value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              {field("Address Line 2")}
              <Input value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("City")}
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("State")}
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Country")}
              <Input value={form.country} onChange={(e) => update("country", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("PIN Code")}
              <Input value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              {field("Owner Name")}
              <Input value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Designation")}
              <Input value={form.ownerDesignation} onChange={(e) => update("ownerDesignation", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Email")}
              <Input type="email" value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Mobile Number")}
              <Input value={form.ownerMobile} onChange={(e) => update("ownerMobile", e.target.value)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Set initial feature access for this organization. You can adjust these anytime from the organization's
              detail page.
            </p>
            {(featuresData?.items.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No features in the catalog yet.</p>
            )}
            {featuresData?.items.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{f.key}</p>
                </div>
                {f.type === "BOOLEAN" ? (
                  <input
                    type="checkbox"
                    checked={featureValues[f.id]?.boolValue ?? false}
                    onChange={(e) =>
                      setFeatureValues((v) => ({ ...v, [f.id]: { boolValue: e.target.checked } }))
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    className="w-28"
                    placeholder="Unlimited"
                    value={featureValues[f.id]?.numValue ?? ""}
                    onChange={(e) =>
                      setFeatureValues((v) => ({
                        ...v,
                        [f.id]: { numValue: e.target.value === "" ? null : Number(e.target.value) },
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              disabled={(step === 0 && !canAdvanceFromStep0) || (step === 1 && !canAdvanceFromStep1)}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending || !canAdvanceFromStep1}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating..." : "Create Organization"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
