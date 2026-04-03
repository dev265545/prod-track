"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWelcomeBack(
      new URLSearchParams(window.location.search).get("welcome") === "1",
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await login(password.trim());
      if (ok) {
        router.replace("/");
        return;
      }
      setError("Incorrect password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-svh min-w-0 flex-1 items-center justify-center p-6 bg-background"
    >
      <Card className="w-full max-w-sm shrink-0">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="text-2xl font-heading">ProdTrack Lite</CardTitle>
          <p className="text-sm text-muted-foreground">
            {welcomeBack
              ? "Welcome back — enter your app password for this database."
              : "Enter password to continue"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loginPassword">Password</Label>
              <Input
                id="loginPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Logging in…
                </>
              ) : (
                "Log in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
