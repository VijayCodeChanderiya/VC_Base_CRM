import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";

export interface PlatformTicketThreadMessage {
  id: string;
  senderType: "ORG" | "SUPER_ADMIN";
  message: string;
  createdAt: string;
  senderUser: { name: string } | null;
}

export function PlatformTicketThread({
  messages,
  viewerType,
}: {
  messages: PlatformTicketThreadMessage[];
  viewerType: "org" | "super_admin";
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        const isOwnSide = viewerType === "org" ? m.senderType === "ORG" : m.senderType === "SUPER_ADMIN";
        const senderName = m.senderUser?.name ?? (m.senderType === "SUPER_ADMIN" ? "Alphatech Support" : "Organization");
        return (
          <div key={m.id} className={cn("flex flex-col gap-1", isOwnSide ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                isOwnSide ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              )}
            >
              {m.message}
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {senderName} · {formatDateTime(m.createdAt)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
