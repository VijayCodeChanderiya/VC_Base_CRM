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
    <div className="flex min-w-0 items-center gap-3">
      {data?.hasLogo ? (
        <img
          src="/api/public/branding/logo"
          alt={data.companyName}
          className={`${dims} shrink-0 rounded-md border border-border object-contain bg-card`}
        />
      ) : (
        <div
          className={`${dims} flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold`}
        >
          {(data?.companyName ?? "A").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className={`${textSize} truncate font-semibold leading-tight`}>{data?.companyName ?? "Customer Portal"}</p>
      </div>
    </div>
  );
}
