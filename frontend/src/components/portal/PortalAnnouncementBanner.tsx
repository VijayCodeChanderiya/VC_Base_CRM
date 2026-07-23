import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { portalApi } from "@/lib/portalApi";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "ALERT";
}

const TONE_CLASS: Record<Announcement["type"], string> = {
  INFO: "border-primary/30 bg-primary/10 text-primary",
  WARNING: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  ALERT: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function PortalAnnouncementBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["portal-announcements"],
    queryFn: async () => (await portalApi.get("/announcements")).data as { items: Announcement[] },
  });

  const visible = (data?.items ?? []).filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className={cn("flex items-start justify-between gap-3 rounded-md border px-4 py-2 text-sm", TONE_CLASS[a.type])}
        >
          <div>
            <span className="font-medium">{a.title}</span>
            <span className="ml-2 opacity-90">{a.message}</span>
          </div>
          <button
            className="shrink-0 opacity-70 hover:opacity-100"
            onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
            aria-label="Dismiss announcement"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
