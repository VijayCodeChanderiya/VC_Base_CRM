import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";

interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  detail?: string;
}

interface TimelineData {
  imei: string;
  status: string;
  product: { name: string; sku: string };
  branch: { name: string };
  events: TimelineEvent[];
}

const TYPE_COLOR: Record<string, string> = {
  PURCHASE: "bg-[#2a78d6]",
  STOCKED: "bg-[#898781]",
  SALE: "bg-[#0ca30c]",
  RETURN: "bg-[#fab219]",
  SIM: "bg-[#4a3aa7]",
  INSTALLATION: "bg-[#1baf7a]",
  WARRANTY: "bg-[#eb6834]",
  RMA: "bg-[#d03b3b]",
};

export function ImeiTimeline() {
  const { imei } = useParams<{ imei: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["imei-timeline", imei],
    queryFn: async () => (await api.get(`/imei/${imei}/timeline`)).data as TimelineData,
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Link to="/imei" className="text-sm text-primary hover:underline w-fit">
        &larr; Back to IMEI search
      </Link>

      {isLoading && <p className="text-sm text-muted-foreground">Loading device history...</p>}
      {error && <p className="text-sm text-destructive">Device not found.</p>}

      {data && (
        <>
          <div>
            <h1 className="text-xl font-semibold font-mono">{data.imei}</h1>
            <p className="text-sm text-muted-foreground">
              {data.product.name} ({data.product.sku}) · {data.branch.name} · Status: {data.status}
            </p>
          </div>

          <Card>
            <CardContent className="p-6">
              {data.events.length === 0 && (
                <p className="text-sm text-muted-foreground">No history recorded for this device yet.</p>
              )}
              <ol className="relative border-l border-border ml-2">
                {data.events.map((event, i) => (
                  <li key={i} className="mb-6 ml-4 last:mb-0">
                    <span
                      className={cn(
                        "absolute -left-1.5 h-3 w-3 rounded-full ring-2 ring-card",
                        TYPE_COLOR[event.type] ?? "bg-muted-foreground"
                      )}
                    />
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.date)}</p>
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    {event.detail && <p className="text-sm text-muted-foreground">{event.detail}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
