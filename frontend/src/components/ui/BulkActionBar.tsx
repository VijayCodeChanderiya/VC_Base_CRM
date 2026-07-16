import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export interface BulkDeleteResult {
  deleted: string[];
  failed: { id: string; reason: string }[];
}

export function BulkActionBar({
  count,
  entityLabel,
  onClear,
  onConfirmDelete,
  isDeleting,
}: {
  count: number;
  entityLabel: string;
  onClear: () => void;
  onConfirmDelete: () => Promise<BulkDeleteResult>;
  isDeleting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<BulkDeleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function runDelete() {
    setError(null);
    try {
      const res = await onConfirmDelete();
      setResult(res);
      setConfirmOpen(false);
      setTyped("");
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to delete selected items";
      setError(message);
    }
  }

  return (
    <>
      <div className="sticky bottom-4 z-40 mt-3 flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 shadow-lg">
        <span className="text-sm">
          {count} {entityLabel}
          {count === 1 ? "" : "s"} selected
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            🗑 Delete selected
          </Button>
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Delete ${count} ${entityLabel}(s)`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Type <span className="font-mono font-semibold">DELETE</span> to confirm.
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={typed.trim() !== "DELETE" || isDeleting}
              onClick={runDelete}
            >
              {isDeleting ? "Deleting..." : "Delete selected"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="Bulk delete result">
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            <p>{result.deleted.length} deleted successfully.</p>
            {result.failed.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-destructive">{result.failed.length} failed:</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {result.failed.map((f) => (
                    <li key={f.id}>{f.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button size="sm" onClick={() => setResult(null)}>
              Close
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
