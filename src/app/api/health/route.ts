import { recordProbe } from "../../../lib/operations.ts";

export const dynamic = "force-dynamic";

export function GET() {
  recordProbe("liveness", true);
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
