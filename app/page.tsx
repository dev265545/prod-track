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
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-5" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
