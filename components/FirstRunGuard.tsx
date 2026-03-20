"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFirstRunComplete } from "@/lib/onboarding";

export function FirstRunGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isFirstRunComplete()) {
      if (!pathname?.startsWith("/onboarding")) router.replace("/onboarding");
    } else {
      if (pathname === "/onboarding") router.replace("/");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
