"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
import { Dashboard } from "@/components/dashboard";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    openDB()
      .then(() => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setReady(true);
      });
  }, [router]);

  if (!ready) {
    return (
      <div
        className="flex min-h-svh w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        <div className="flex flex-col items-center justify-center gap-6 animate-loading-screen-in">
          <Spinner className="size-16 text-primary stroke-[1.5]" />
          <span className="animate-loading-screen-in-delay text-lg font-medium text-muted-foreground">
            Loading…
          </span>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
