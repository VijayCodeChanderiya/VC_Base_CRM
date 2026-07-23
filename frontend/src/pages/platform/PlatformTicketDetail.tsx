import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformTicketThread, type PlatformTicketThreadMessage } from "@/components/shared/PlatformTicketThread";
import { useAuthStore } from "@/store/auth";

interface PlatformTicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  organization: { id: string; name: string };
  raisedBy: { name: string; email: string };
  assignedTo: { id: string; name: string } | null;
  messages: PlatformTicketThreadMessage[];
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "AWAITING_ORG", "RESOLVED", "CLOSED"];

export function PlatformTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [reply, setReply] = useState("");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["platform-ticket", id],
    queryFn: async () => (await api.get(`/platform/tickets/${id}`)).data as PlatformTicketDetail,
    enabled: !!id,
  });

  const replyMutation = useMutation({
    mutationFn: async (resolve: boolean) => api.post(`/platform/tickets/${id}/messages`, { message: reply, resolve }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["platform-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["platform-tickets"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => api.patch(`/platform/tickets/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["platform-tickets"] });
    },
  });

  const assignSelfMutation = useMutation({
    mutationFn: async () => api.patch(`/platform/tickets/${id}/assign`, { assignedToId: currentUser!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["platform-tickets"] });
    },
  });

  if (isLoading || !ticket) {
    return <p className="text-sm text-muted-foreground">Loading ticket...</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate("/platform/tickets")}>
        ← Back to platform tickets
      </Button>

      <div>
        <h1 className="text-xl font-semibold">
          {ticket.ticketNumber} — {ticket.subject}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ticket.organization.name} · Raised by {ticket.raisedBy.name} · {ticket.category} · {ticket.priority} priority
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={ticket.status}
            onChange={(e) => statusMutation.mutate(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Assigned to</label>
          <p className="flex h-9 items-center text-sm">
            {ticket.assignedTo?.name ?? (
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                disabled={assignSelfMutation.isPending}
                onClick={() => assignSelfMutation.mutate()}
              >
                Assign to me
              </button>
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <PlatformTicketThread messages={ticket.messages} viewerType="super_admin" />

          {ticket.status === "CLOSED" ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">This ticket is closed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                className="min-h-20 rounded-md border border-border bg-background p-2 text-sm"
                placeholder="Type your reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={replyMutation.isPending || !reply.trim()}
                  onClick={() => replyMutation.mutate(false)}
                >
                  {replyMutation.isPending ? "Sending..." : "Send Reply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={replyMutation.isPending || !reply.trim()}
                  onClick={() => replyMutation.mutate(true)}
                >
                  Reply & Resolve
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
