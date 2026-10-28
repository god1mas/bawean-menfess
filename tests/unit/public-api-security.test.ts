import { describe, expect, it } from "vitest";
import {
  createHumanReadableTrackingCode,
  createRateLimitIdentifier,
  createRateLimitKeyDigest,
  createTrackingCredentialPairForIdempotency,
  createTrackingUrlToken,
  digestCredential,
  loadD2Secrets,
  normalizeClientAddress,
  parseTrackingCredential,
  trustedClientAddress,
} from "../../src/lib/public-api/security";

const environment = {
  NODE_ENV: "test",
  TRACKING_CODE_HMAC_KEY_V1: "code-key-12345678901234567890123456789012",
  TRACKING_URL_HMAC_KEY_V1: "url-key-123456789012345678901234567890123",
  RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1:
    "rate-key-12345678901234567890123456789012",
  BETTER_AUTH_SECRET: "auth-key-12345678901234567890123456789012",
};

describe("D2 credential security", () => {
  it("creates a 100-bit human-readable code with an unambiguous alphabet", () => {
    const code = createHumanReadableTrackingCode(
      Buffer.from(Array.from({ length: 20 }, (_, index) => index)),
    );

    expect(code).toMatch(
      /^BM-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/,
    );
    expect(code.replaceAll("-", "").slice(2)).toHaveLength(20);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it("creates a 256-bit unpadded base64url token", () => {
    const token = createTrackingUrlToken(Buffer.alloc(32, 0xab));

    expect(token).toMatch(/^bmu_[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain("=");
  });

  it("normalizes tracking codes while keeping URL tokens case-sensitive", () => {
    expect(
      parseTrackingCredential(" bm-0123-4567-89ab-cdef-ghjk "),
    ).toEqual({ kind: "code", normalized: "BM-0123-4567-89AB-CDEF-GHJK" });

    const urlToken = `bmu_${Buffer.alloc(32, 7).toString("base64url")}`;
    expect(parseTrackingCredential(urlToken)).toEqual({
      kind: "url",
      normalized: urlToken,
    });
    expect(parseTrackingCredential("BM-XXXXXXXX")).toBeNull();
  });

  it("creates deterministic HMAC-SHA-256 digests without returning plaintext", () => {
    const key = Buffer.from(environment.TRACKING_CODE_HMAC_KEY_V1);
    const digest = digestCredential("BM-0123-4567-89AB-CDEF-GHJK", key);

    expect(digest).toHaveLength(32);
    expect(
      digest.equals(
        digestCredential("BM-0123-4567-89AB-CDEF-GHJK", key),
      ),
    ).toBe(true);
    expect(
      digest.equals(
        digestCredential(
          "BM-0123-4567-89AB-CDEF-GHJK",
          Buffer.from(environment.TRACKING_URL_HMAC_KEY_V1),
        ),
      ),
    ).toBe(false);
    expect(digest.toString("utf8")).not.toContain("BM-0123");
  });

  it("derives stable confidential credentials from a 256-bit request key", () => {
    const requestKey = `bmi_${Buffer.alloc(32, 0x5a).toString("base64url")}`;
    const first = createTrackingCredentialPairForIdempotency(
      requestKey,
      Buffer.from(environment.TRACKING_CODE_HMAC_KEY_V1),
      Buffer.from(environment.TRACKING_URL_HMAC_KEY_V1),
    );
    const replay = createTrackingCredentialPairForIdempotency(
      requestKey,
      Buffer.from(environment.TRACKING_CODE_HMAC_KEY_V1),
      Buffer.from(environment.TRACKING_URL_HMAC_KEY_V1),
    );
    const distinct = createTrackingCredentialPairForIdempotency(
      `bmi_${Buffer.alloc(32, 0x6b).toString("base64url")}`,
      Buffer.from(environment.TRACKING_CODE_HMAC_KEY_V1),
      Buffer.from(environment.TRACKING_URL_HMAC_KEY_V1),
    );

    expect(replay.trackingCode).toBe(first.trackingCode);
    expect(replay.trackingUrlToken).toBe(first.trackingUrlToken);
    expect(distinct.trackingCode).not.toBe(first.trackingCode);
    expect(distinct.trackingUrlToken).not.toBe(first.trackingUrlToken);
    expect(first.trackingCodeDigest.toString("utf8")).not.toContain(requestKey);
  });

  it("requires independent server-only HMAC secrets", () => {
    expect(loadD2Secrets(environment).trackingCodeKey).toHaveLength(
      Buffer.byteLength(environment.TRACKING_CODE_HMAC_KEY_V1),
    );
    expect(() =>
      loadD2Secrets({
        ...environment,
        TRACKING_URL_HMAC_KEY_V1: environment.TRACKING_CODE_HMAC_KEY_V1,
      }),
    ).toThrow(/independent/);
    expect(() =>
      loadD2Secrets({ ...environment, TRACKING_CODE_HMAC_KEY_V1: "short" }),
    ).toThrow(/32 bytes/);
  });
});

describe("rate-limit client identity", () => {
  it("normalizes equivalent IPv6 spellings", () => {
    expect(normalizeClientAddress("0:0:0:0:0:0:0:1")).toBe("::1");
    expect(normalizeClientAddress("::1")).toBe("::1");
    expect(() => normalizeClientAddress("not-an-address")).toThrow();
  });

  it("trusts Vercel metadata in production and rejects arbitrary proxy chains", () => {
    const request = new Request("https://example.test", {
      headers: { "x-vercel-forwarded-for": "203.0.113.4" },
    });
    expect(
      trustedClientAddress(request, {
        ...environment,
        NODE_ENV: "production",
        VERCEL: "1",
      }),
    ).toBe("203.0.113.4");
    expect(() =>
      trustedClientAddress(
        new Request("https://example.test", {
          headers: { "x-vercel-forwarded-for": "203.0.113.4, 198.51.100.2" },
        }),
        { ...environment, NODE_ENV: "production", VERCEL: "1" },
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      trustedClientAddress(request, { ...environment, NODE_ENV: "production" }),
    ).toThrow(/trusted production proxy/);
  });

  it("domain-separates public and administrator rate-limit identities", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.9" },
    });
    const submission = createRateLimitIdentifier(
      request,
      "submission",
      environment,
    );
    const tracking = createRateLimitIdentifier(request, "tracking", environment);
    const login = createRateLimitKeyDigest(
      "198.51.100.9|/sign-in/email",
      "admin-login",
      environment,
    );

    expect(submission.digest).toHaveLength(32);
    expect(tracking.digest).toHaveLength(32);
    expect(submission.digest.equals(tracking.digest)).toBe(false);
    expect(login.digest).toHaveLength(32);
    expect(login.digest.equals(submission.digest)).toBe(false);
    expect(login.digest.toString("utf8")).not.toContain("198.51.100.9");
  });
});
