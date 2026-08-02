"use client";

import { useState, useSyncExternalStore } from "react";
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
import { loginAs } from "@/lib/auth";
import { useLanguage } from "@/components/language-provider";
import { AppHeaderActions } from "@/components/app-header-actions";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  // The URL is an external value: reading it during render would disagree
  // with the server markup, and filling state from an effect cost an extra
  // render in which the wrong greeting was on screen. Read as a store, with
  // "not a returning visitor" as the server answer.
  const welcomeBack = useSyncExternalStore(
    () => () => {},
    () =>
      new URLSearchParams(window.location.search).get("welcome") === "1",
    () => false,
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const role = await loginAs(password.trim());
      if (role !== null) {
        router.replace("/");
        return;
      }
      setError(t("loginIncorrect"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-svh min-w-0 flex-1 items-center justify-center p-6 bg-background"
    >
      <div className="absolute right-3 top-3 z-10 flex sm:right-4 sm:top-4">
        <AppHeaderActions showLogout={false} />
      </div>
      <Card className="w-full max-w-sm shrink-0">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="text-2xl font-heading" translate="no">
            {t("appName")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {welcomeBack ? t("loginSubtitleWelcome") : t("loginSubtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loginPassword">{t("loginPassword")}</Label>
              <Input
                id="loginPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t("loginPasswordPlaceholder")}
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
                  {t("loginSubmitting")}
                </>
              ) : (
                t("loginSubmit")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
