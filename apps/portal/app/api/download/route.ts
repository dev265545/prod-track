import { cookies } from "next/headers";

import { portalCookie, sessionValid } from "@/lib/auth";
import { resolveLatestPortableZip } from "@/lib/github";
import { fetchZipUpstream } from "@/lib/streamZip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get(portalCookie.name)?.value;
  if (!sessionValid(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let info: Awaited<ReturnType<typeof resolveLatestPortableZip>>;
  try {
    info = await resolveLatestPortableZip();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "resolve failed";
    return new Response(msg, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetchZipUpstream(info);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failed";
    return new Response(msg, { status: 500 });
  }

  if (!upstream.ok) {
    const t = await upstream.text();
    return new Response(`Upstream ${upstream.status}: ${t.slice(0, 200)}`, {
      status: 502,
    });
  }
  if (!upstream.body) {
    return new Response("Empty upstream body", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${info.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
