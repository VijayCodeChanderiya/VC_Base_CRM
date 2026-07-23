import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { portalApi } from "@/lib/portalApi";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function PortalNotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data } = useQuery({
    queryKey: ["portal-notifications"],
    queryFn: async () => (await portalApi.get("/notifications")).data as { items: Notification[] },
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => portalApi.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-notifications"] }),
  });

  const unreadCount = data?.items.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg z-40 max-h-96 overflow-y-auto">
          {(data?.items.length ?? 0) === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No notifications</p>
          )}
          {data?.items.map((n) => (
            <button
              key={n.id}
              className={cn(
                "block w-full text-left border-b border-border last:border-0 p-3 hover:bg-muted",
                !n.isRead && "bg-muted/50"
              )}
              onClick={() => !n.isRead && markRead.mutate(n.id)}
            >
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
