import { describe, expect, it, vi } from "vitest";
import {
  adminLoginRateLimit,
  createAdminLoginRateLimitStorage,
} from "../../src/lib/admin-login-rate-limit";

const environment = {
  TRACKING_CODE_HMAC_KEY_V1: "code-key-12345678901234567890123456789012",
  TRACKING_URL_HMAC_KEY_V1: "url-key-123456789012345678901234567890123",
  RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1:
    "rate-key-12345678901234567890123456789012",
};

describe("administrator login rate-limit storage", () => {
  it("HMACs Better Auth's trusted identity before the atomic database call", async () => {
    const consumeRateLimit = vi.fn<
      (digest: Buffer, keyVersion: number) => Promise<{
        allowed: boolean;
        remaining: number;
        retryAfterSeconds: number;
      }>
    >(async () => ({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 321,
    }));
    const storage = createAdminLoginRateLimitStorage({
      consumeRateLimit,
      environment,
    });
    const rawKey = "198.51.100.42|/sign-in/email";

    await expect(storage.consume(rawKey, adminLoginRateLimit)).resolves.toEqual({
      allowed: false,
      retryAfter: 321,
    });
    const digest = consumeRateLimit.mock.calls[0]?.[0];
    expect(digest).toBeInstanceOf(Buffer);
    expect(digest).toHaveLength(32);
    expect(digest?.toString("utf8")).not.toContain("198.51.100.42");
    expect(consumeRateLimit).toHaveBeenCalledWith(digest, 1);
  });

  it("fails closed if the configured application and database rules diverge", async () => {
    const storage = createAdminLoginRateLimitStorage({
      consumeRateLimit: vi.fn(),
      environment,
    });

    await expect(storage.consume("key", { max: 6, window: 900 })).rejects.toThrow(
      /Unexpected administrator login rate-limit rule/,
    );
  });
});
