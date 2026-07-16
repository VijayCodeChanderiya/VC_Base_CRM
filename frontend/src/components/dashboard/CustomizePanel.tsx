import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_CARDS, useDashboardPrefs } from "@/store/dashboardPrefs";

export function CustomizePanel() {
  const [open, setOpen] = useState(false);
  const { visibility, toggleCard, resetAll } = useDashboardPrefs();

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        Customize
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-md border border-border bg-card shadow-lg z-40 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Dashboard cards</p>
              <button className="text-xs text-primary hover:underline" onClick={resetAll}>
                Show all
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
              {DASHBOARD_CARDS.map((card) => (
                <label
                  key={card.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibility[card.id]}
                    onChange={() => toggleCard(card.id)}
                  />
                  {card.label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
