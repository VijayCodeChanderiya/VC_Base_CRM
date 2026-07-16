import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { portalApi } from "@/lib/portalApi";
import { useCustomerAuthStore } from "@/store/customerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyBrand } from "@/components/portal/CompanyBrand";

export function PortalLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useCustomerAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (username.trim().length < 3) {
      setError("Enter your username");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await portalApi.post("/auth/login", { username: username.trim(), password });
      setAuth(res.data.token, res.data.customer);
      navigate("/portal");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Invalid username or password";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <CompanyBrand size="lg" />
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">Sign in to view your purchases</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Please wait..." : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Don&apos;t have login details? Contact the store — your username and password are set up for you.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
