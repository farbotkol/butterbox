import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordRequestError } = await import("./lib/operations.ts");
    recordRequestError(context.routeType);
  }
};
