import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/guarded-route";
import { readReleaseProvenance } from "@/lib/release/release-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authenticated release facts for operators and deployment checks; never a public health route. */
export const GET = adminRoute(async () => {
  const provenance = await readReleaseProvenance();
  return NextResponse.json(provenance, {
    status: provenance.status === "published" ? 200 : 503,
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
});
