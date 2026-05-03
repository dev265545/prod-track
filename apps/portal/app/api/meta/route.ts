import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { portalCookie, sessionValid } from "../../../lib/auth";
import { resolveLatestPortableZip } from "../../../lib/github";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get(portalCookie.name)?.value;
  if (!sessionValid(token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const info = await resolveLatestPortableZip();
    return NextResponse.json({
      ok: true,
      tag: info.tag,
      filename: info.filename,
      publishedAt: info.publishedAt,
      changelogEn: info.changelogEn,
      changelogHi: info.changelogHi,
      userGuideEn: info.userGuideEn,
      userGuideHi: info.userGuideHi,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
