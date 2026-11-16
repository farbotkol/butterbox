import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { submitRosterSms, verifyTwilioFormSignature } from "../src/lib/twilio-sms.ts";

const credentials = {
  accountSid: `AC${"a".repeat(32)}`,
  authToken: "synthetic-test-value",
  messagingServiceSid: `MG${"b".repeat(32)}`,
};
const phone = "+61400000000";
const messageSid = `SM${"c".repeat(32)}`;
const response = (status, data) => new Response(JSON.stringify(data), { status });

test("the Twilio adapter uses a messaging service and returns only a message SID", async () => {
  let calls = 0;
  const result = await submitRosterSms(credentials, phone, async (url, init) => {
    calls++;
    assert.equal(url, `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.body.get("MessagingServiceSid"), credentials.messagingServiceSid);
    assert.equal(init.body.get("To"), phone);
    assert.equal(init.body.has("From"), false);
    assert.match(init.body.get("Body"), /Sign in/);
    return response(201, { sid: messageSid, to: phone });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { kind: "accepted", messageSid });
});

test("invalid addresses and configuration never invoke the transport", async () => {
  for (const [config, destination] of [
    [credentials, "0400000000"],
    [credentials, "+00000000"],
    [{ ...credentials, accountSid: "invalid" }, phone],
    [{ ...credentials, messagingServiceSid: "invalid" }, phone],
    [{ ...credentials, authToken: "" }, phone],
  ]) {
    assert.deepEqual(await submitRosterSms(config, destination, () => {
      assert.fail("invalid inputs must not be sent");
    }), { kind: "invalid" });
  }
});

test("only explicit rate-limit rejection is transient; ambiguous responses are not retried", async () => {
  for (const [status, payload, kind] of [
    [429, { code: 20429, message: "private details" }, "transient"],
    [429, { code: 999 }, "unknown"],
    [400, { message: "private details" }, "permanent"],
    [408, {}, "unknown"],
    [500, {}, "unknown"],
    [201, { sid: "invalid" }, "unknown"],
  ]) {
    assert.deepEqual(await submitRosterSms(credentials, phone, async () => response(status, payload)), { kind });
  }
  assert.deepEqual(await submitRosterSms(credentials, phone, async () => {
    throw new Error("private provider details");
  }), { kind: "unknown" });
  assert.deepEqual(await submitRosterSms(credentials, phone, async () => new Response("invalid json", { status: 201 })),
    { kind: "unknown" });
});

test("form callback verification rejects tampering and sorts repeated values", () => {
  const url = "https://example.test/twilio/status?delivery=1";
  const form = new URLSearchParams("MessageStatus=delivered&MessageSid=SM123&Extra=z&Extra=a");
  const canonical = `${url}ExtraaExtrazMessageSidSM123MessageStatusdelivered`;
  const signature = createHmac("sha1", credentials.authToken).update(canonical).digest("base64");
  assert.equal(verifyTwilioFormSignature(url, form, signature, credentials.authToken), true);
  assert.equal(verifyTwilioFormSignature(url, new URLSearchParams("MessageStatus=failed"), signature,
    credentials.authToken), false);
  assert.equal(verifyTwilioFormSignature(`${url}x`, form, signature, credentials.authToken), false);
  assert.equal(verifyTwilioFormSignature(url, form, "invalid", credentials.authToken), false);
  assert.equal(verifyTwilioFormSignature(url.replace("https:", "http:"), form, signature, credentials.authToken), false);
  assert.equal(verifyTwilioFormSignature(url, form, signature, ""), false);
});
