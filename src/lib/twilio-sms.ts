import { createHmac, timingSafeEqual } from "node:crypto";

type TwilioCredentials = Readonly<{
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
}>;

type TwilioTransport = (url: string, init: RequestInit) => Promise<Response>;

export type TwilioSmsResult =
  | { kind: "accepted"; messageSid: string }
  | { kind: "transient" | "permanent" | "unknown" | "invalid" };

const accountSidPattern = /^AC[0-9a-f]{32}$/i;
const serviceSidPattern = /^MG[0-9a-f]{32}$/i;
const messageSidPattern = /^(SM|MM)[0-9a-f]{32}$/i;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;
const rosterMessage = "Your Butterbox roster has been updated. Sign in to view it.";

export async function submitRosterSms(
  credentials: TwilioCredentials,
  phone: string,
  transport: TwilioTransport,
): Promise<TwilioSmsResult> {
  if (!accountSidPattern.test(credentials.accountSid) ||
      !serviceSidPattern.test(credentials.messagingServiceSid) ||
      !credentials.authToken || !phonePattern.test(phone)) {
    return { kind: "invalid" };
  }

  const body = new URLSearchParams({
    To: phone,
    MessagingServiceSid: credentials.messagingServiceSid,
    Body: rosterMessage,
  });
  let response: Response;
  try {
    response = await transport(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        redirect: "error",
      },
    );
  } catch {
    return { kind: "unknown" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "unknown" };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { kind: "unknown" };
  }
  const result = payload as { sid?: unknown; code?: unknown };
  if (response.ok && typeof result.sid === "string" && messageSidPattern.test(result.sid)) {
    return { kind: "accepted", messageSid: result.sid };
  }
  if (response.status === 429 && result.code === 20429) return { kind: "transient" };
  if (response.status >= 400 && response.status < 500 && response.status !== 408 &&
      response.status !== 429) return { kind: "permanent" };
  return { kind: "unknown" };
}

export function verifyTwilioFormSignature(
  callbackUrl: string,
  form: URLSearchParams,
  signature: string,
  authToken: string,
): boolean {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      !authToken || !/^[A-Za-z0-9+/]{27}=$/.test(signature)) return false;

  let signed = callbackUrl;
  for (const key of [...new Set(form.keys())].sort()) {
    for (const value of [...new Set(form.getAll(key))].sort()) signed += key + value;
  }
  const expected = createHmac("sha1", authToken).update(signed, "utf8").digest();
  const supplied = Buffer.from(signature, "base64");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
