import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { portalApi } from "@/lib/portalApi";
import { useCustomerAuthStore } from "@/store/customerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalAccount() {
  const { customer, setAuth, token } = useCustomerAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState(customer?.username ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = { currentPassword };
      if (newUsername.trim() && newUsername.trim() !== customer?.username) {
        payload.newUsername = newUsername.trim();
      }
      if (newPassword) {
        payload.newPassword = newPassword;
      }
      return (await portalApi.patch("/account", payload)).data;
    },
    onSuccess: (updated) => {
      if (token) {
        setAuth(token, { ...customer!, username: updated.username });
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not update account"
      );
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      setError("Enter your current password to confirm this change");
      return;
    }
    if (newUsername.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Account</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Change username or password</CardTitle>
          <p className="text-xs text-muted-foreground">
            Confirm with your current password. Leave the new password fields blank to keep it unchanged.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Username</label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">New Password (optional)</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Leave blank to keep current password"
              />
            </div>
            {newPassword && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}
            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3">
              <label className="text-xs text-muted-foreground">Current Password *</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Required to confirm changes"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && <p className="text-sm text-primary">Updated successfully.</p>}
            <Button type="submit" disabled={mutation.isPending} className="w-fit">
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
