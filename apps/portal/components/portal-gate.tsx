"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Loader2, ScrollText } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Meta = {
  tag: string;
  filename: string;
  publishedAt: string;
  changelogEn: string | null;
  changelogHi: string | null;
  userGuideEn: string | null;
  userGuideHi: string | null;
};

type Locale = "en" | "hi";

function mdFallback(locale: Locale, kind: "changelog" | "guide") {
  if (locale === "hi") {
    return kind === "changelog"
      ? "_इस बिल्ड के लिए चेंजलॉग अभी उपलब्ध नहीं है। ज़िप के अंदर `portable/docs/CHANGELOG_USER_HI.md` देखें।_"
      : "_इस बिल्ड के लिए गाइड यहाँ लोड नहीं हुई। ज़िप में `portable/docs/USER_GUIDE_HI.md` शामिल है।_";
  }
  return kind === "changelog"
    ? "_No changelog payload for this build. See `portable/docs/CHANGELOG_USER_EN.md` inside the ZIP._"
    : "_No guide payload for this build. See `portable/docs/USER_GUIDE_EN.md` inside the ZIP._";
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div
      className="md-content max-h-[min(52vh,520px)] overflow-y-auto rounded-xl border border-card-border/50 bg-background/35 p-4 text-left text-sm leading-relaxed text-foreground/90 shadow-inner [&_code]:rounded [&_code]:bg-card/90 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8rem] [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

export function PortalGate() {
  const [phase, setPhase] = useState<"checking" | "gate" | "inside">("checking");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [docTab, setDocTab] = useState<"changelog" | "guide">("changelog");

  const refreshMeta = useCallback(async () => {
    const r = await fetch("/api/meta", { credentials: "include" });
    if (!r.ok) return false;
    const j = (await r.json()) as Meta & { ok?: boolean };
    if (!j || typeof j.tag !== "string") return false;
    setMeta({
      tag: j.tag,
      filename: j.filename,
      publishedAt: j.publishedAt,
      changelogEn: j.changelogEn ?? null,
      changelogHi: j.changelogHi ?? null,
      userGuideEn: j.userGuideEn ?? null,
      userGuideHi: j.userGuideHi ?? null,
    });
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await refreshMeta();
      if (cancelled) return;
      setPhase(ok ? "inside" : "gate");
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMeta]);

  const docMarkdown = useMemo(() => {
    if (!meta) return "";
    if (docTab === "changelog") {
      const raw = locale === "en" ? meta.changelogEn : meta.changelogHi;
      return raw?.trim() ? raw : mdFallback(locale, "changelog");
    }
    const raw = locale === "en" ? meta.userGuideEn : meta.userGuideHi;
    return raw?.trim() ? raw : mdFallback(locale, "guide");
  }, [docTab, locale, meta]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key }),
      });
      if (!r.ok) {
        setError("That key does not match.");
        return;
      }
      const inside = await refreshMeta();
      if (!inside) {
        setError("Signed in, but could not read release metadata.");
        return;
      }
      setPhase("inside");
      setKey("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2
          className="size-8 animate-spin text-accent"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <div
        className="blob pointer-events-none absolute -left-32 top-1/4 size-[520px] rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />
      <div
        className="blob pointer-events-none absolute -right-24 bottom-0 size-[480px] rounded-full bg-accent-dim/15 blur-3xl [animation-delay:-7s]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.22_0.04_75/0.35),transparent_55%)]"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md space-y-8 sm:max-w-2xl">
        <p className="animate-rise text-center font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          ProdTrack
        </p>

        {phase === "gate" ? (
          <Card className="animate-rise-delay-1">
            <CardHeader>
              <CardTitle className="text-xl">Enter</CardTitle>
              <CardDescription>Use the access key you were given.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <Input
                  name="key"
                  type="password"
                  autoComplete="off"
                  placeholder="Access key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={busy}
                  required
                />
                {error ? (
                  <p className="text-sm text-red-300/90" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="animate-rise-delay-1 space-y-6">
            <Card className="text-center">
              <CardHeader>
                <CardTitle className="text-xl">Latest build</CardTitle>
                <CardDescription>
                  {meta ? (
                    <>
                      <span className="block font-mono text-xs text-foreground/90">
                        {meta.filename}
                      </span>
                      <span className="mt-1 block text-xs">
                        {meta.tag}
                        {meta.publishedAt
                          ? ` · ${new Date(meta.publishedAt).toLocaleString()}`
                          : ""}
                      </span>
                    </>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 pt-0">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <a href="/api/download" download>
                    <Download className="size-4" />
                    Download ZIP
                  </a>
                </Button>
                <p className="text-xs text-muted">
                  Same access key next time — this page always tracks the newest
                  published bundle.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg">Notes for this version</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={locale === "en" ? "default" : "outline"}
                      onClick={() => setLocale("en")}
                    >
                      English
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={locale === "hi" ? "default" : "outline"}
                      onClick={() => setLocale("hi")}
                    >
                      हिन्दी
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={docTab === "changelog" ? "default" : "outline"}
                    onClick={() => setDocTab("changelog")}
                  >
                    <ScrollText className="size-3.5" />
                    Changelog
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={docTab === "guide" ? "default" : "outline"}
                    onClick={() => setDocTab("guide")}
                  >
                    <BookOpen className="size-3.5" />
                    Unzip and run
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {docTab === "changelog"
                    ? locale === "hi"
                      ? "नवीनतम कमिट सारांश (ज़िप में पूर्ण फ़ाइलें भी हैं)।"
                      : "Recent commits summary (full files are also inside the ZIP)."
                    : locale === "hi"
                      ? "निकालें, चलाएँ, और डेटाबेस फ़ाइल के बारे में — ज़िप में विस्तृत गाइड।"
                      : "Unzip, launch scripts, and what the app asks for — detailed files ship in the ZIP too."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MarkdownBlock text={docMarkdown} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
