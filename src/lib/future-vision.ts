import { isShowcase } from "./showcase.ts";

type FutureVisionConfig = {
  flag?: string;
  environment?: string;
  showcase: boolean;
  apiUrl?: string;
  siteUrl?: string;
};

function isLocalHttpOrigin(value: string | undefined): value is string {
  if (!value || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
}

export function futureVisionPreviewEnabled(config: FutureVisionConfig): boolean {
  if (config.flag === undefined || config.flag === "false") return false;
  if (config.flag !== "true") {
    throw new Error("BUTTERBOX_FUTURE_VISION_PREVIEW must be true or false.");
  }
  if (config.showcase) return true;
  if (config.environment === "development" &&
    isLocalHttpOrigin(config.apiUrl) && isLocalHttpOrigin(config.siteUrl) &&
    new URL(config.apiUrl).origin !== new URL(config.siteUrl).origin) return true;
  throw new Error("Future concepts require the verified showcase or a separate local development environment.");
}

export function isFutureVisionPreviewEnabled(): boolean {
  return futureVisionPreviewEnabled({
    flag: process.env.BUTTERBOX_FUTURE_VISION_PREVIEW,
    environment: process.env.NODE_ENV,
    showcase: isShowcase(),
    apiUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export const futureVisionConcepts = [
  {
    id: "assistant",
    title: "AI rostering assistant",
    description: "A future assistant could help a manager explore staffing options.",
    example: "Illustrative example: asking about coverage for a fictional lunch shift.",
    limitation: "No assistant generates suggestions or changes a roster here.",
  },
  {
    id: "forecast",
    title: "Demand forecasting",
    description: "A future forecast could compare expected demand across service periods.",
    example: "Illustrative example: imagining a busier weekend than weekday.",
    limitation: "No bookings or weather data is connected and no forecast is produced.",
  },
  {
    id: "award",
    title: "Award Central review",
    description: "A future review could present a rule source for a person to examine.",
    example: "Illustrative example: a fictional shift with an imagined rule reference.",
    limitation: "No award interpretation, entitlement, payroll or compliance decision is made.",
  },
] as const;
