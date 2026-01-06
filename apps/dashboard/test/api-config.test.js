import assert from "node:assert/strict";
import { test } from "node:test";
import { getValidatedApiBaseUrl } from "../lib/api-config.js";

const withEnv = async (updates, run) => {
  const original = { ...process.env };
  Object.assign(process.env, updates);
  try {
    await run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(original)) {
      process.env[key] = value;
    }
  }
};

test("defaults NEXT_PUBLIC_API_URL to the API port", async () => {
  await withEnv({ NEXT_PUBLIC_API_URL: "", PORT: "" }, () => {
    const apiUrl = getValidatedApiBaseUrl();
    assert.equal(apiUrl, "http://127.0.0.1:3002");
  });
});

test("rejects NEXT_PUBLIC_API_URL pointing at the dashboard port", async () => {
  await withEnv({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001" }, () => {
    assert.throws(
      () => getValidatedApiBaseUrl(),
      /cannot point to the dashboard port/i,
    );
  });
});
