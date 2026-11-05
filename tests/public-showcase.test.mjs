import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDedicatedTunnelStatus } from "../scripts/public-showcase.mjs";

test("the public supervisor requires one stopped tunnel pointing only to its gateway", () => {
  const origin = "https://0123456789abcdef.abcdefghijkl.opentunnel.xyz";
  const route = "0123456789abcdef.abcdefghijkl.opentunnel.xyz  →  127.0.0.1:3140";
  const stopped = `Profile: butterbox-showcase\n${route}\nService: stopped (connect with: opentunnel up)\n`;
  assert.doesNotThrow(() => assertDedicatedTunnelStatus(stopped, origin));
  for (const invalid of [
    stopped.replace("Service: stopped", "Service: connected"),
    stopped.replace("127.0.0.1:3140", "127.0.0.1:3137"),
    stopped.replace("0123456789abcdef", "fedcba9876543210"),
    `${stopped}another.route  →  127.0.0.1:3000\n`,
    stopped.replace(route, ""),
  ]) {
    assert.throws(() => assertDedicatedTunnelStatus(invalid, origin), /must be stopped and route only/);
  }
});
