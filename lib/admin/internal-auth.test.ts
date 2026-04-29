import { afterEach, describe, expect, it } from "vitest";

import { ensureInternalApiKey } from "./internal-auth";

const originalKey = process.env.INTERNAL_API_KEY;

afterEach(() => {
  process.env.INTERNAL_API_KEY = originalKey;
});

describe("ensureInternalApiKey", () => {
  it("rejects requests when the admin key is not configured", () => {
    delete process.env.INTERNAL_API_KEY;

    const response = ensureInternalApiKey(new Request("http://local.test"));

    expect(response?.status).toBe(500);
  });

  it("rejects requests with a missing or wrong key", () => {
    process.env.INTERNAL_API_KEY = "secret";

    const response = ensureInternalApiKey(new Request("http://local.test"));

    expect(response?.status).toBe(401);
  });

  it("accepts requests with the configured key", () => {
    process.env.INTERNAL_API_KEY = "secret";

    const response = ensureInternalApiKey(
      new Request("http://local.test", {
        headers: { "X-INTERNAL-API-KEY": "secret" },
      }),
    );

    expect(response).toBeNull();
  });
});
