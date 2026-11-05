import { operationalMetrics, operationsAccess } from "../../../lib/operations.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const access = operationsAccess(request.headers.get("authorization"), process.env.BUTTERBOX_OPERATIONS_TOKEN);
  const headers = { "Cache-Control": "no-store" };
  if (access === "unconfigured") {
    console.error("Operational metrics unavailable.", { code: "operations_token_unconfigured" });
    return Response.json({ error: "Metrics unavailable" }, { status: 503, headers });
  }
  if (access !== "authorised") {
    return Response.json({ error: "Unauthorised" }, {
      status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" },
    });
  }
  return Response.json(operationalMetrics(), { headers });
}
