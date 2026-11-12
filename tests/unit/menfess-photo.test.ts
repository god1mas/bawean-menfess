import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES, preparePhoto, validPhotoPath } from "../../src/lib/menfess-photo";
import { createPhotoSubmissionHandler, type PhotoSubmissionDependencies } from "../../src/lib/public-api/handlers";

const idempotencyKey = `bmi_${"a".repeat(43)}`;

async function image(format: "jpeg" | "png" | "webp" = "png") {
  const pipeline = sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } });
  const bytes = await pipeline.toFormat(format).toBuffer();
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  return new File([Uint8Array.from(bytes)], `sender-location.${format}`, { type: mime });
}

function photoRequest(files: File[]) {
  const form = new FormData();
  form.set("category", "curhat");
  form.set("message", "Menfess dengan foto.");
  form.set("consent", "true");
  form.set("idempotencyKey", idempotencyKey);
  for (const file of files) form.append("photo", file);
  return new Request("http://localhost/api/public/menfess", { method: "POST", body: form });
}

function dependencies(): PhotoSubmissionDependencies {
  return {
    identifyClient: vi.fn(() => ({ digest: Buffer.alloc(32), keyVersion: 1 })),
    consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 30 })),
    listActiveCategories: vi.fn(async () => []),
    findPublicStatus: vi.fn(async () => null),
    stagePhoto: vi.fn(async () => "11111111-1111-4111-8111-111111111111"),
    discardStagedPhoto: vi.fn(async () => undefined),
    submitMenfess: vi.fn(async () => ({
      kind: "created" as const,
      credentials: {
        trackingCode: "BM-0123-4567-89AB-CDEF-GHJK",
        trackingUrlToken: `bmu_${"a".repeat(43)}`,
        trackingPath: `/lacak#t=bmu_${"a".repeat(43)}`,
        trackingCodeDigest: Buffer.alloc(32),
        trackingCodeKeyVersion: 1,
        trackingUrlDigest: Buffer.alloc(32),
        trackingUrlKeyVersion: 1,
      },
    })),
  };
}

describe("optional menfess photo", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts and re-encodes a real %s image", async (format) => {
    const prepared = await preparePhoto(await image(format));
    expect(prepared.contentType).toBe(format === "jpeg" ? "image/jpeg" : `image/${format}`);
    expect(prepared.bytes.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(prepared.contentSha256).toHaveLength(32);
    expect(validPhotoPath(prepared.objectPath)).toBe(true);
    expect(prepared.objectPath).not.toContain("sender-location");
  });

  it("rejects unsupported MIME, spoofed contents, and oversized files", async () => {
    const png = await image();
    await expect(preparePhoto(new File(["GIF89a"], "x.gif", { type: "image/gif" }))).rejects.toThrow(/JPEG/);
    await expect(preparePhoto(new File(["not a png"], "x.png", { type: "image/png" }))).rejects.toThrow(/Isi foto/);
    await expect(preparePhoto(new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "x.png", { type: "image/png" }))).rejects.toThrow(/1 MiB/);
    expect(png.size).toBeGreaterThan(0);
  });

  it("submits one validated image without exposing its filename or bytes", async () => {
    const deps = dependencies();
    const response = await createPhotoSubmissionHandler(deps)(photoRequest([await image()]));
    expect(response.status).toBe(201);
    expect(deps.stagePhoto).toHaveBeenCalledOnce();
    expect(deps.submitMenfess).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain("sender-location");
    expect(deps.discardStagedPhoto).not.toHaveBeenCalled();
  });

  it("rejects a second photo and rate-limits before decoding", async () => {
    const deps = dependencies();
    const response = await createPhotoSubmissionHandler(deps)(photoRequest([await image(), await image()]));
    expect(response.status).toBe(400);
    expect(deps.stagePhoto).not.toHaveBeenCalled();
    vi.mocked(deps.consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const denied = await createPhotoSubmissionHandler(deps)(photoRequest([await image()]));
    expect(denied.status).toBe(429);
    expect(deps.stagePhoto).not.toHaveBeenCalled();
  });

  it("discards a staged duplicate or failed submission", async () => {
    const deps = dependencies();
    vi.mocked(deps.submitMenfess).mockResolvedValueOnce({ kind: "idempotency-conflict" });
    const conflict = await createPhotoSubmissionHandler(deps)(photoRequest([await image()]));
    expect(conflict.status).toBe(409);
    expect(deps.discardStagedPhoto).toHaveBeenCalledOnce();
    vi.mocked(deps.submitMenfess).mockRejectedValueOnce(new Error("database unavailable"));
    const failure = await createPhotoSubmissionHandler(deps)(photoRequest([await image()]));
    expect(failure.status).toBe(503);
    expect(deps.discardStagedPhoto).toHaveBeenCalledTimes(2);
  });

  it("preserves a successful replay response when staged cleanup needs later reconciliation", async () => {
    const deps = dependencies();
    const created = await deps.submitMenfess("curhat", "Menfess dengan foto.", idempotencyKey);
    if (!("credentials" in created)) throw new Error("Missing test credentials.");
    vi.mocked(deps.submitMenfess).mockResolvedValueOnce({ kind: "replayed", credentials: created.credentials });
    vi.mocked(deps.discardStagedPhoto).mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await createPhotoSubmissionHandler(deps)(photoRequest([await image()]));
    expect(response.status).toBe(200);
    expect(deps.discardStagedPhoto).toHaveBeenCalledOnce();
  });
});
