import { applicationReady, recordProbe } from "../../../lib/operations.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ready = await applicationReady(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  recordProbe("readiness", ready);
  return Response.json({ status: ready ? "ok" : "unavailable" }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
