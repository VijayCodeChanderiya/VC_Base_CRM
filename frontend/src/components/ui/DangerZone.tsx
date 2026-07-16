import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DangerZone({
  label,
  confirmText,
  onDelete,
  isDeleting,
  error,
}: {
  label: string;
  confirmText: string;
  onDelete: () => void;
  isDeleting: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim() === confirmText.trim();

  return (
    <div className="col-span-2 mt-4 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-destructive">Danger zone</p>
      {!open ? (
        <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)} className="w-fit">
          Delete {label}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            This cannot be undone. Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            deletion.
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmText}
            autoComplete="off"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!matches || isDeleting}
              onClick={onDelete}
            >
              {isDeleting ? "Deleting..." : `Delete ${label}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
