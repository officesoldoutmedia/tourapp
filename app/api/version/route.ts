import { NextResponse } from "next/server";

/** ID-ul build-ului care rulează pe server — pentru detecția de deploy nou. */
export function GET() {
  return new NextResponse(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev", {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
