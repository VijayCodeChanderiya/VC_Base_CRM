import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { portalApi } from "@/lib/portalApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/date";

type TicketCategory = "WARRANTY" | "BILLING" | "TECHNICAL" | "SUBSCRIPTION" | "INSTALLATION" | "OTHER";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH";
type TicketStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_CUSTOMER" | "RESOLVED" | "CLOSED";

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  updatedAt: string;
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: "WARRANTY", label: "Warranty" },
  { value: "BILLING", label: "Billing" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "OTHER", label: "Other" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_CUSTOMER: "Awaiting your reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<TicketStatus, string> = {
  OPEN: "bg-primary/10 text-primary",
  IN_PROGRESS: "bg-primary/10 text-primary",
  AWAITING_CUSTOMER: "bg-warning/15 text-warning",
  RESOLVED: "bg-success/15 text-success",
  CLOSED: "bg-muted text-muted-foreground",
};

const emptyForm = { subject: "", category: "OTHER" as TicketCategory, priority: "MEDIUM" as TicketPriority, message: "" };

export function PortalTickets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-tickets"],
    queryFn: async () => (await portalApi.get("/tickets")).data as { items: Ticket[] },
  });

  const createMutation = useMutation({
    mutationFn: async () => portalApi.post("/tickets", form),
    onSuccess: (res) => {
      setCreateOpen(false);
      setForm(emptyForm);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      navigate(`/portal/tickets/${res.data.id}`);
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create ticket");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Support Tickets</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + New Ticket
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && (data?.items.length ?? 0) === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No support tickets yet.</p>
          )}
          {data && data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Ticket #</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                    onClick={() => navigate(`/portal/tickets/${t.id}`)}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{t.ticketNumber}</td>
                    <td className="px-4 py-2 font-medium">{t.subject}</td>
                    <td className="px-4 py-2">{CATEGORY_OPTIONS.find((c) => c.value === t.category)?.label}</td>
                    <td className="px-4 py-2">{PRIORITY_OPTIONS.find((p) => p.value === t.priority)?.label}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">{formatDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Support Ticket">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Subject *</label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              minLength={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Priority</label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Describe the issue *</label>
            <textarea
              className="min-h-24 rounded-md border border-border bg-background p-2 text-sm"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit Ticket"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
