import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformTicketThread, type PlatformTicketThreadMessage } from "@/components/shared/PlatformTicketThread";

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  messages: PlatformTicketThreadMessage[];
}

export function OrgTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["org-ticket", id],
    queryFn: async () => (await api.get(`/platform-tickets/${id}`)).data as TicketDetail,
    enabled: !!id,
  });

  const replyMutation = useMutation({
    mutationFn: async () => api.post(`/platform-tickets/${id}/messages`, { message: reply }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["org-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["org-tickets"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => api.post(`/platform-tickets/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["org-tickets"] });
    },
  });

  if (isLoading || !ticket) {
    return <p className="text-sm text-muted-foreground">Loading ticket...</p>;
  }

  const isClosed = ticket.status === "CLOSED";

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate("/org-tickets")}>
        ← Back to tickets
      </Button>

      <div>
        <h1 className="text-xl font-semibold">
          {ticket.ticketNumber} — {ticket.subject}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ticket.category} · {ticket.priority} priority · {ticket.status}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <PlatformTicketThread messages={ticket.messages} viewerType="org" />

          {isClosed ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">This ticket is closed.</p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) replyMutation.mutate();
              }}
            >
              <textarea
                className="min-h-20 rounded-md border border-border bg-background p-2 text-sm"
                placeholder="Type your reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={replyMutation.isPending || !reply.trim()}>
                  {replyMutation.isPending ? "Sending..." : "Send Reply"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={closeMutation.isPending}
                  onClick={() => closeMutation.mutate()}
                >
                  Close Ticket
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
