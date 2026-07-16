import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/publicApi";

interface Branding {
  companyName: string;
  phone: string | null;
  hasLogo: boolean;
}

export function useBranding() {
  return useQuery({
    queryKey: ["public-branding"],
    queryFn: async () => (await publicApi.get("/branding")).data as Branding,
    staleTime: 5 * 60 * 1000,
  });
}

export function CompanyBrand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { data } = useBranding();
  const dims = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const textSize = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";

  return (
    <div className="flex items-center gap-3">
      {data?.hasLogo ? (
        <img
          src="/api/public/branding/logo"
          alt={data.companyName}
          className={`${dims} rounded-md border border-border object-contain bg-card`}
        />
      ) : (
        <div
          className={`${dims} flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold`}
        >
          {(data?.companyName ?? "A").charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className={`${textSize} font-semibold leading-tight`}>{data?.companyName ?? "Customer Portal"}</p>
      </div>
    </div>
  );
}
