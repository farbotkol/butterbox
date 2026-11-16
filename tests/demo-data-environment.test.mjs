import assert from "node:assert/strict";
import test from "node:test";
import { demoDataProjectRef } from "../src/lib/demo-data-environment.ts";

const base = {
  BUTTERBOX_DEMO_DATA_ENABLED: "true",
  BUTTERBOX_DEMO_DATA_ENVIRONMENT: "development",
  BUTTERBOX_DEMO_DATA_PROJECT_REF: "butterbox",
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

test("demo data remains disabled without every explicit local development setting", () => {
  assert.equal(demoDataProjectRef({ ...base, BUTTERBOX_DEMO_DATA_ENABLED: undefined }), null);
  assert.equal(demoDataProjectRef({ ...base, BUTTERBOX_DEMO_DATA_ENVIRONMENT: "production" }), null);
  assert.equal(demoDataProjectRef({ ...base, BUTTERBOX_DEMO_DATA_PROJECT_REF: undefined }), null);
  assert.equal(demoDataProjectRef({ ...base, NODE_ENV: "production" }), null);
  assert.equal(demoDataProjectRef({ ...base, NEXT_PUBLIC_SUPABASE_URL: "not a URL" }), null);
});

test("local development requires a loopback Supabase URL with a port", () => {
  assert.equal(demoDataProjectRef(base), "butterbox");
  assert.equal(demoDataProjectRef({
    ...base,
    BUTTERBOX_DEMO_DATA_PROJECT_REF: "butterbox-citest",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59421",
  }), "butterbox-citest");
  assert.equal(demoDataProjectRef({ ...base, NEXT_PUBLIC_SUPABASE_URL: "http://db.example.test:58421" }), null);
  assert.equal(demoDataProjectRef({ ...base, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1" }), null);
  assert.equal(demoDataProjectRef({ ...base, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58421" }), null);
  assert.equal(demoDataProjectRef({
    ...base, BUTTERBOX_DEMO_DATA_PROJECT_REF: "butterbox-agent-test",
  }), null);
});

test("Vercel deployments require the configured hosted project and production runtime opt-in", () => {
  const preview = {
    ...base,
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    BUTTERBOX_DEMO_DATA_PROJECT_REF: "butterbox",
    NEXT_PUBLIC_SUPABASE_URL: "https://butterbox.supabase.co",
  };
  assert.equal(demoDataProjectRef(preview), "butterbox");
  assert.equal(demoDataProjectRef({ ...preview, VERCEL_ENV: "production" }), null);
  assert.equal(demoDataProjectRef({
    ...preview,
    VERCEL_ENV: "production",
    BUTTERBOX_DEMO_DATA_ALLOW_PRODUCTION_RUNTIME: "true",
  }), "butterbox");
  assert.equal(demoDataProjectRef({
    ...preview,
    VERCEL_ENV: "production",
    BUTTERBOX_DEMO_DATA_ALLOW_PRODUCTION_RUNTIME: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co",
  }), null);
  assert.equal(demoDataProjectRef({
    ...preview, NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co",
  }), null);
});
