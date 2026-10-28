import { describe, expect, it, vi } from "vitest";
import {
  createCategoriesHandler,
  createSubmissionHandler,
  createTrackingHandler,
  type PublicApiDependencies,
} from "../../src/lib/public-api/handlers";

const idempotencyKey = `bmi_${"a".repeat(43)}`;

function dependencies(
  overrides: Partial<PublicApiDependencies> = {},
): PublicApiDependencies {
  return {
    identifyClient: vi.fn(() => ({ digest: Buffer.alloc(32), keyVersion: 1 })),
    consumeRateLimit: vi.fn(async () => ({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 3_600,
    })),
    listActiveCategories: vi.fn(async () => [
      { slug: "curhat", label: "Curhat" },
    ]),
    submitMenfess: vi.fn(async () => ({
      kind: "created" as const,
      credentials: {
        trackingCode: "BM-0123-4567-89AB-CDEF-GHJK",
        trackingUrlToken: `bmu_${"a".repeat(43)}`,
        trackingPath: `/lacak#t=bmu_${"a".repeat(43)}`,
        trackingCodeDigest: Buffer.alloc(32, 1),
        trackingCodeKeyVersion: 1,
        trackingUrlDigest: Buffer.alloc(32, 2),
        trackingUrlKeyVersion: 1,
      },
    })),
    findPublicStatus: vi.fn(async () => "PENDING" as const),
    ...overrides,
  };
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public categories handler", () => {
  it("returns only active public category fields with no-store headers", async () => {
    const response = await createCategoriesHandler(dependencies())();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      categories: [{ slug: "curhat", label: "Curhat" }],
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("anonymous submission handler", () => {
  it("returns only the one-time public tracking credentials", async () => {
    const deps = dependencies();
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "curhat",
        message: "Cerita yang aman untuk dimoderasi.",
        consent: true,
        idempotencyKey,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      trackingCode: "BM-0123-4567-89AB-CDEF-GHJK",
      trackingPath: `/lacak#t=bmu_${"a".repeat(43)}`,
    });
    expect(JSON.stringify(body)).not.toMatch(/digest|keyVersion|id|message/i);
    expect(deps.submitMenfess).toHaveBeenCalledWith(
      "curhat",
      "Cerita yang aman untuk dimoderasi.",
      idempotencyKey,
    );
  });

  it("rejects administrative fields and does not execute database operations", async () => {
    const deps = dependencies();
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "curhat",
        message: "Tidak boleh menentukan status.",
        consent: true,
        idempotencyKey,
        status: "PUBLISHED",
      }),
    );

    expect(response.status).toBe(400);
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.submitMenfess).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before executing business operations", async () => {
    const deps = dependencies();
    const response = await createSubmissionHandler(deps)(
      new Request("http://localhost/api/public/menfess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "curhat",
          message: "x".repeat(5_000),
          consent: true,
          idempotencyKey,
        }),
      }),
    );

    expect(response.status).toBe(413);
    expect(deps.identifyClient).not.toHaveBeenCalled();
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.submitMenfess).not.toHaveBeenCalled();
  });

  it("does not echo potentially executable user text", async () => {
    const deps = dependencies({
      submitMenfess: vi.fn(async () => ({
        kind: "category-unavailable" as const,
      })),
    });
    const attack = "<script>alert('xss')</script>";
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "missing",
        message: attack,
        consent: true,
        idempotencyKey,
      }),
    );

    expect(await response.text()).not.toContain(attack);
  });

  it("fails closed when rate limiting is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = dependencies({
      consumeRateLimit: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    try {
      const response = await createSubmissionHandler(deps)(
        jsonRequest("/api/public/menfess", {
          category: "curhat",
          message: "Pesan valid.",
          consent: true,
          idempotencyKey,
        }),
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: "SERVICE_UNAVAILABLE",
        message: "Menfess belum dapat dikirim. Coba lagi nanti.",
      });
      expect(deps.submitMenfess).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[public-api] Request failed", {
        operation: "submission",
        errorName: "Error",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("database unavailable");
    } finally {
      log.mockRestore();
    }
  });

  it("returns an actionable retry delay after the limit", async () => {
    const deps = dependencies({
      consumeRateLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 120,
      })),
    });
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "curhat",
        message: "Pesan valid.",
        consent: true,
        idempotencyKey,
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(deps.submitMenfess).not.toHaveBeenCalled();
  });

  it("rejects an invalid idempotency identifier before rate limiting", async () => {
    const deps = dependencies();
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "curhat",
        message: "Pesan valid.",
        consent: true,
        idempotencyKey: "predictable",
      }),
    );

    expect(response.status).toBe(400);
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.submitMenfess).not.toHaveBeenCalled();
  });

  it("returns the original credentials for a safe request replay", async () => {
    const deps = dependencies();
    vi.mocked(deps.submitMenfess).mockResolvedValueOnce({
      kind: "replayed",
      credentials: {
        trackingCode: "BM-0123-4567-89AB-CDEF-GHJK",
        trackingUrlToken: `bmu_${"a".repeat(43)}`,
        trackingPath: `/lacak#t=bmu_${"a".repeat(43)}`,
        trackingCodeDigest: Buffer.alloc(32, 1),
        trackingCodeKeyVersion: 1,
        trackingUrlDigest: Buffer.alloc(32, 2),
        trackingUrlKeyVersion: 1,
      },
    });
    const response = await createSubmissionHandler(deps)(
      jsonRequest("/api/public/menfess", {
        category: "curhat",
        message: "Pesan valid.",
        consent: true,
        idempotencyKey,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      trackingCode: "BM-0123-4567-89AB-CDEF-GHJK",
    });
  });
});

describe("tracking handler", () => {
  it.each(["PENDING", "APPROVED", "REJECTED", "PUBLISHED"] as const)(
    "returns the public-safe %s status projection",
    async (status) => {
      const response = await createTrackingHandler(
        dependencies({ findPublicStatus: vi.fn(async () => status) }),
      )(
        jsonRequest("/api/public/track", {
          token: "BM-0123-4567-89AB-CDEF-GHJK",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status });
    },
  );

  it("uses the same response for malformed and unknown credentials", async () => {
    const handler = createTrackingHandler(
      dependencies({ findPublicStatus: vi.fn(async () => null) }),
    );
    const malformed = await handler(
      jsonRequest("/api/public/track", { token: "not-a-token" }),
    );
    const unknown = await handler(
      jsonRequest("/api/public/track", {
        token: "BM-0123-4567-89AB-CDEF-GHJK",
      }),
    );

    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await malformed.json()).toEqual(await unknown.json());
  });

  it("fails closed when the tracking rate limiter is unavailable", async () => {
    const response = await createTrackingHandler(
      dependencies({
        consumeRateLimit: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
    )(
      jsonRequest("/api/public/track", {
        token: "BM-0123-4567-89AB-CDEF-GHJK",
      }),
    );

    expect(response.status).toBe(503);
  });
});
