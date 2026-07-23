import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PortalComingSoon({
  title,
  description,
  icon: Icon = Sparkles,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon size={22} />
          </div>
          <p className="text-base font-medium">Coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {description ?? `${title} isn't available yet, but it's on our roadmap. In the meantime, reach us through Support.`}
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/portal/tickets")}>
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
