"use client";

import { useMediaQuery } from "@/lib/hooks/useClientValue";

const MOBILE_BREAKPOINT = 768;

/**
 * Was a `useState` filled in by an effect, which cost one guaranteed extra
 * render on every mount and made the first frame claim "not mobile" even on a
 * phone. `useMediaQuery` subscribes to the query itself — see
 * `lib/hooks/useClientValue.ts` for why that is the right shape.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
