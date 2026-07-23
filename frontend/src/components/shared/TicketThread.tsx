import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";

export interface TicketThreadMessage {
  id: string;
  senderType: "CUSTOMER" | "STAFF";
  message: string;
  createdAt: string;
  senderCustomer: { name: string } | null;
  senderUser: { name: string } | null;
}

export function TicketThread({
  messages,
  viewerType,
}: {
  messages: TicketThreadMessage[];
  viewerType: "customer" | "staff";
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        const isOwnSide = viewerType === "customer" ? m.senderType === "CUSTOMER" : m.senderType === "STAFF";
        const senderName = m.senderCustomer?.name ?? m.senderUser?.name ?? (m.senderType === "STAFF" ? "Support" : "Customer");
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
