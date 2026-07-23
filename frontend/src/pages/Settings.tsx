import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThemeStore, type Theme } from "@/store/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; description: string; swatch: string }[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright theme with a blue accent",
    swatch: "linear-gradient(90deg, #eff6ff, #2563eb)",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-light theme",
    swatch: "linear-gradient(90deg, #0b0f19, #6366f1)",
  },
];

export function Settings() {
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex w-44 flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors",
                theme === opt.value ? "border-primary ring-2 ring-primary" : "border-border hover:bg-muted"
              )}
            >
              <span className="h-8 w-full rounded" style={{ background: opt.swatch }} />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Company name, logo, contact details, address, and GST/PAN/CIN are now managed from My Organization.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/my-organization")}>
            Open My Organization
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
