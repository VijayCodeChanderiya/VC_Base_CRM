import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TicketThread, type TicketThreadMessage } from "@/components/shared/TicketThread";

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  customer: { name: string; phone: string; email: string | null };
  assignedTo: { id: string; name: string } | null;
  messages: TicketThreadMessage[];
}

interface StaffUser {
  id: string;
  name: string;
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"];

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data as TicketDetail,
    enabled: !!id,
  });

  const { data: users } = useQuery({
    queryKey: ["users", "for-ticket-assign"],
    queryFn: async () => (await api.get("/users", { params: { pageSize: 100 } })).data as { items: StaffUser[] },
  });

  const replyMutation = useMutation({
    mutationFn: async (resolve: boolean) => api.post(`/tickets/${id}/messages`, { message: reply, resolve }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (assignedToId: string | null) => api.patch(`/tickets/${id}/assign`, { assignedToId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => api.patch(`/tickets/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  if (isLoading || !ticket) {
    return <p className="text-sm text-muted-foreground">Loading ticket...</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate("/tickets")}>
        ← Back to tickets
      </Button>

      <div>
        <h1 className="text-xl font-semibold">
          {ticket.ticketNumber} — {ticket.subject}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ticket.customer.name} ({ticket.customer.phone}) · {ticket.category} · {ticket.priority} priority
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
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={ticket.assignedTo?.id ?? ""}
            onChange={(e) => assignMutation.mutate(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {users?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <TicketThread messages={ticket.messages} viewerType="staff" />

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
