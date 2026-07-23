import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface OrgProfileValues {
  name: string;
  displayName: string | null;
  companyEmail: string | null;
  mobileNumber: string | null;
  alternateContactNumber: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  cinNumber: string | null;
  website: string | null;
  industryType: string | null;
  businessType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  ownerName: string | null;
  ownerDesignation: string | null;
  ownerEmail: string | null;
  ownerMobile: string | null;
}

const INDUSTRY_OPTIONS = ["Automotive", "Logistics", "Retail", "Manufacturing", "Services", "Other"];
const BUSINESS_TYPE_OPTIONS = ["Proprietorship", "Partnership", "Private Limited", "LLP", "Other"];

function field(label: string) {
  return <label className="text-xs text-muted-foreground">{label}</label>;
}

export function OrgProfileForm({
  initial,
  hasLogo,
  logoUrl,
  onSaveProfile,
  onUploadLogo,
  onRemoveLogo,
  isSaving,
  isUploadingLogo,
  isRemovingLogo,
}: {
  initial: OrgProfileValues;
  hasLogo: boolean;
  logoUrl: string | null;
  onSaveProfile: (patch: Partial<OrgProfileValues>) => void;
  onUploadLogo: (file: File) => void;
  onRemoveLogo: () => void;
  isSaving: boolean;
  isUploadingLogo: boolean;
  isRemovingLogo: boolean;
}) {
  const [values, setValues] = useState<OrgProfileValues>(initial);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValues(initial), [initial]);

  function update<K extends keyof OrgProfileValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 sm:col-span-2">
            {field("Company Logo")}
            <div className="flex items-center gap-3">
              {hasLogo && logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-md border border-border object-contain bg-card" />
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
                  if (f) onUploadLogo(f);
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={isUploadingLogo} onClick={() => logoInputRef.current?.click()}>
                {isUploadingLogo ? "Uploading..." : hasLogo ? "Change logo" : "Upload logo"}
              </Button>
              {hasLogo && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isRemovingLogo}
                  onClick={onRemoveLogo}
                  className="text-destructive hover:text-destructive"
                >
                  {isRemovingLogo ? "Removing..." : "Remove logo"}
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              {field("Organization Name")}
              <Input value={values.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Display Name")}
              <Input value={values.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Company Email")}
              <Input type="email" value={values.companyEmail ?? ""} onChange={(e) => update("companyEmail", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Mobile Number")}
              <Input value={values.mobileNumber ?? ""} onChange={(e) => update("mobileNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Alternate Contact Number")}
              <Input value={values.alternateContactNumber ?? ""} onChange={(e) => update("alternateContactNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Website")}
              <Input value={values.website ?? ""} onChange={(e) => update("website", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              {field("GST Number")}
              <Input value={values.gstNumber ?? ""} onChange={(e) => update("gstNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("PAN Number")}
              <Input value={values.panNumber ?? ""} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("CIN Number")}
              <Input value={values.cinNumber ?? ""} onChange={(e) => update("cinNumber", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1">
              {field("Industry Type")}
              <select
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                value={values.industryType ?? ""}
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
                value={values.businessType ?? ""}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Address Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 sm:col-span-2">
            {field("Address Line 1")}
            <Input value={values.addressLine1 ?? ""} onChange={(e) => update("addressLine1", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            {field("Address Line 2")}
            <Input value={values.addressLine2 ?? ""} onChange={(e) => update("addressLine2", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("City")}
            <Input value={values.city ?? ""} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("State")}
            <Input value={values.state ?? ""} onChange={(e) => update("state", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("Country")}
            <Input value={values.country ?? ""} onChange={(e) => update("country", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("PIN Code")}
            <Input value={values.pincode ?? ""} onChange={(e) => update("pincode", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Organization Owner</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            {field("Owner Name")}
            <Input value={values.ownerName ?? ""} onChange={(e) => update("ownerName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("Designation")}
            <Input value={values.ownerDesignation ?? ""} onChange={(e) => update("ownerDesignation", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("Email")}
            <Input type="email" value={values.ownerEmail ?? ""} onChange={(e) => update("ownerEmail", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            {field("Mobile Number")}
            <Input value={values.ownerMobile ?? ""} onChange={(e) => update("ownerMobile", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button className="w-fit" disabled={isSaving} onClick={() => onSaveProfile(values)}>
        {isSaving ? "Saving..." : "Save Profile"}
      </Button>
    </div>
  );
}
