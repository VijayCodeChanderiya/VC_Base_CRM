import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useOrgContextStore } from "@/store/orgContext";

interface Organization {
  id: string;
  name: string;
  displayName: string | null;
}

export function OrgSelector() {
  const { organizationId, setOrganization } = useOrgContextStore();

  const { data } = useQuery({
    queryKey: ["platform-org-selector"],
    queryFn: async () =>
      (await api.get("/platform/organizations", { params: { pageSize: 500 } })).data as {
        items: Organization[];
      },
  });

  if (!data?.items.length) return null;

  return (
    <select
      className="h-9 rounded-md border border-border bg-card px-2 text-sm font-medium"
      value={organizationId ?? ""}
      onChange={(e) => {
        const org = data.items.find((o) => o.id === e.target.value);
        setOrganization(org?.id ?? null, org?.displayName || org?.name || null);
      }}
    >
      <option value="">Platform view (no organization)</option>
      {data.items.map((o) => (
        <option key={o.id} value={o.id}>
          Acting as: {o.displayName || o.name}
        </option>
      ))}
    </select>
  );
}
