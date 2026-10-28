import { describe, expect, it, vi } from "vitest";
import {
  ClientRequestError,
  requestJson,
} from "../../src/lib/client-json";

const options = {
  fallbackMessage: "Permintaan gagal dengan aman.",
  timeoutMessage: "Permintaan terlalu lama.",
};

describe("client JSON request handling", () => {
  it("preserves safe JSON validation feedback", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          message: "Periksa kembali formulir menfess.",
          fields: { message: "Pesan menfess wajib diisi." },
        },
        { status: 400 },
      ),
    );

    await expect(
      requestJson("/api/test", {}, { ...options, fetcher }),
    ).rejects.toMatchObject({
      message: "Periksa kembali formulir menfess.",
      fields: { message: "Pesan menfess wajib diisi." },
      status: 400,
    });
  });

  it.each([
    new Response("<html>upstream error</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    }),
    new Response("{broken", {
      status: 502,
      headers: { "Content-Type": "application/json" },
    }),
  ])("maps non-JSON and malformed responses to safe copy", async (response) => {
    await expect(
      requestJson("/api/test", {}, {
        ...options,
        fetcher: vi.fn(async () => response),
      }),
    ).rejects.toEqual(
      expect.objectContaining({ message: options.fallbackMessage }),
    );
  });

  it("maps network failures without exposing internal details", async () => {
    await expect(
      requestJson("/api/test", {}, {
        ...options,
        fetcher: vi.fn(async () => {
          throw new TypeError("getaddrinfo ENOTFOUND secret.internal");
        }),
      }),
    ).rejects.toEqual(
      expect.objectContaining({ message: options.fallbackMessage }),
    );
  });

  it("aborts bounded requests with a user-safe timeout", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    await expect(
      requestJson("/api/test", {}, { ...options, timeoutMs: 1, fetcher }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: ClientRequestError.name,
        message: options.timeoutMessage,
      }),
    );
  });
});
