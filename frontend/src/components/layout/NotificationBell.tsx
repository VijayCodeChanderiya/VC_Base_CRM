import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data as { items: Notification[] },
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = data?.items.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="relative">
      <button
        className="relative rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
        onClick={() => setOpen((o) => !o)}
      >
        Notifications
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-md border border-border bg-card shadow-lg z-40 max-h-96 overflow-y-auto">
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
