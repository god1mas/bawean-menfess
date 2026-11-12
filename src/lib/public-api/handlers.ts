import { z } from "zod";
import { MAX_PHOTO_BYTES, PhotoValidationError, preparePhoto } from "@/lib/menfess-photo";
import type { StagedPhoto } from "@/lib/public-api/repository";
import type {
  PublicCategory,
  PublicMenfessStatus,
  RateLimitDecision,
  RateLimitScope,
  SubmissionRepositoryResult,
} from "@/lib/public-api/contracts";
import {
  submissionPayloadSchema,
  trackingPayloadSchema,
} from "@/lib/public-api/contracts";

const MAX_PUBLIC_BODY_BYTES = 4_096;

type ClientIdentifier = {
  digest: Buffer;
  keyVersion: number;
};

export type PublicApiDependencies = {
  identifyClient: (
    request: Request,
    scope: RateLimitScope,
  ) => ClientIdentifier;
  consumeRateLimit: (
    scope: RateLimitScope,
    digest: Buffer,
    keyVersion: number,
  ) => Promise<RateLimitDecision>;
  listActiveCategories: () => Promise<PublicCategory[]>;
  submitMenfess: (
    categorySlug: string,
    message: string,
    idempotencyKey: string,
    photo?: StagedPhoto,
  ) => Promise<SubmissionRepositoryResult>;
  findPublicStatus: (
    rawCredential: string,
  ) => Promise<PublicMenfessStatus | null>;
};

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(
  body: unknown,
  init: { status: number; headers?: Record<string, string> },
) {
  return Response.json(body, {
    status: init.status,
    headers: { ...responseHeaders, ...init.headers },
  });
}

export type PhotoSubmissionDependencies = PublicApiDependencies & {
  stagePhoto: (photo: Awaited<ReturnType<typeof preparePhoto>>) => Promise<string>;
  discardStagedPhoto: (id: string) => Promise<void>;
};

const MAX_MULTIPART_BYTES = MAX_PHOTO_BYTES + 16_384;

async function readMultipart(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/iu.test(contentType)) {
    return { kind: "unsupported" } as const;
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return { kind: "too-large" } as const;
  }
  if (!request.body) return { kind: "invalid" } as const;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        return { kind: "too-large" } as const;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bounded = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.concat(chunks, bytes),
    });
    return { kind: "form", value: await bounded.formData() } as const;
  } catch {
    return { kind: "invalid" } as const;
  }
}

export function createPhotoSubmissionHandler(dependencies: PhotoSubmissionDependencies) {
  return async function POST(request: Request): Promise<Response> {
    let stagedId: string | undefined;
    try {
      // Consume the established anonymous submission limit before parsing or
      // decoding user-controlled binary data.
      const identity = dependencies.identifyClient(request, "submission");
      const limit = await dependencies.consumeRateLimit(
        "submission", identity.digest, identity.keyVersion,
      );
      if (!limit.allowed) return rateLimitResponse(limit);

      const body = await readMultipart(request);
      if (body.kind !== "form") return bodyError(body.kind);
      const form = body.value;
      const allowed = new Set(["category", "message", "consent", "idempotencyKey", "photo"]);
      if ([...form.keys()].some((key) => !allowed.has(key)) ||
        [...allowed].some((key) => form.getAll(key).length > 1)) {
        return json({ code: "VALIDATION_ERROR", message: "Formulir berisi data berulang atau tidak dikenal." }, { status: 400 });
      }
      const parsed = submissionPayloadSchema.safeParse({
        category: form.get("category"),
        message: form.get("message"),
        consent: form.get("consent") === "true",
        idempotencyKey: form.get("idempotencyKey"),
      });
      if (!parsed.success) {
        return json({ code: "VALIDATION_ERROR", message: "Periksa kembali formulir menfess.", fields: validationErrors(parsed.error) }, { status: 400 });
      }
      const rawPhoto = form.get("photo");
      if (rawPhoto !== null && !(rawPhoto instanceof File)) {
        return json({ code: "VALIDATION_ERROR", message: "Foto tidak valid.", fields: { photo: "Pilih satu foto JPEG, PNG, atau WebP." } }, { status: 400 });
      }
      const photo = rawPhoto ? await preparePhoto(rawPhoto) : undefined;
      if (photo) stagedId = await dependencies.stagePhoto(photo);
      const submission = await dependencies.submitMenfess(
        parsed.data.category,
        parsed.data.message,
        parsed.data.idempotencyKey,
        photo && stagedId ? { id: stagedId, contentSha256: photo.contentSha256 } : undefined,
      );
      if (submission.kind !== "created" && stagedId) {
        // Reconciliation owns a failed delete. It must not turn an already
        // committed idempotent replay into a misleading submission failure.
        await dependencies.discardStagedPhoto(stagedId).catch((error: unknown) => {
          logRequestFailure("photo-discard", error);
        });
        stagedId = undefined;
      }
      if (submission.kind === "category-unavailable") {
        return json({ code: "CATEGORY_UNAVAILABLE", message: "Kategori yang dipilih sedang tidak tersedia.", fields: { category: "Pilih kategori lain yang tersedia." } }, { status: 400 });
      }
      if (submission.kind === "idempotency-conflict") {
        return json({ code: "IDEMPOTENCY_CONFLICT", message: "Permintaan ini sudah digunakan untuk kiriman yang berbeda. Muat ulang halaman lalu coba lagi." }, { status: 409 });
      }
      if (!("credentials" in submission)) throw new Error("Unexpected submission result.");
      return json({
        trackingCode: submission.credentials.trackingCode,
        trackingPath: submission.credentials.trackingPath,
      }, { status: submission.kind === "created" ? 201 : 200 });
    } catch (error) {
      if (stagedId) await dependencies.discardStagedPhoto(stagedId).catch(() => undefined);
      if (error instanceof PhotoValidationError) {
        return json({ code: "VALIDATION_ERROR", message: error.message, fields: { photo: error.message } }, { status: 400 });
      }
      logRequestFailure("photo-submission", error);
      return json({ code: "SERVICE_UNAVAILABLE", message: "Menfess belum dapat dikirim. Coba lagi nanti." }, { status: 503 });
    }
  };
}

async function readJson(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];

  if (contentType !== "application/json") {
    return { kind: "unsupported" } as const;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_BODY_BYTES) {
    return { kind: "too-large" } as const;
  }

  if (!request.body) {
    return { kind: "invalid" } as const;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      byteLength += value.byteLength;

      if (byteLength > MAX_PUBLIC_BODY_BYTES) {
        await reader.cancel();
        return { kind: "too-large" } as const;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks, byteLength).toString("utf8");

  try {
    return { kind: "json", value: JSON.parse(text) as unknown } as const;
  } catch {
    return { kind: "invalid" } as const;
  }
}

function logRequestFailure(operation: string, error: unknown) {
  console.error("[public-api] Request failed", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

function validationErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === "string" && !fields[field]) {
      fields[field] = issue.message;
    }
  }

  return fields;
}

function bodyError(kind: "unsupported" | "too-large" | "invalid") {
  if (kind === "unsupported") {
    return json(
      { code: "UNSUPPORTED_MEDIA_TYPE", message: "Gunakan format JSON." },
      { status: 415 },
    );
  }

  if (kind === "too-large") {
    return json(
      { code: "PAYLOAD_TOO_LARGE", message: "Permintaan terlalu besar." },
      { status: 413 },
    );
  }

  return json(
    { code: "INVALID_REQUEST", message: "Permintaan tidak valid." },
    { status: 400 },
  );
}

function rateLimitResponse(decision: RateLimitDecision) {
  return json(
    {
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Coba lagi setelah beberapa saat.",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    },
  );
}

export function createCategoriesHandler(dependencies: PublicApiDependencies) {
  return async function GET() {
    try {
      const categories = await dependencies.listActiveCategories();
      return json({ categories }, { status: 200 });
    } catch (error) {
      logRequestFailure("categories", error);
      return json(
        {
          code: "SERVICE_UNAVAILABLE",
          message: "Kategori belum dapat dimuat. Coba lagi nanti.",
        },
        { status: 503 },
      );
    }
  };
}

export function createSubmissionHandler(dependencies: PublicApiDependencies) {
  return async function POST(request: Request) {
    try {
      const body = await readJson(request);

      if (body.kind !== "json") {
        return bodyError(body.kind);
      }

      const parsed = submissionPayloadSchema.safeParse(body.value);

      if (!parsed.success) {
        return json(
          {
            code: "VALIDATION_ERROR",
            message: "Periksa kembali formulir menfess.",
            fields: validationErrors(parsed.error),
          },
          { status: 400 },
        );
      }

      const identity = dependencies.identifyClient(request, "submission");
      const rateLimit = await dependencies.consumeRateLimit(
        "submission",
        identity.digest,
        identity.keyVersion,
      );

      if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit);
      }

      const submission = await dependencies.submitMenfess(
        parsed.data.category,
        parsed.data.message,
        parsed.data.idempotencyKey,
      );

      if (submission.kind === "category-unavailable") {
        return json(
          {
            code: "CATEGORY_UNAVAILABLE",
            message: "Kategori yang dipilih sedang tidak tersedia.",
            fields: { category: "Pilih kategori lain yang tersedia." },
          },
          { status: 400 },
        );
      }

      if (submission.kind === "idempotency-conflict") {
        return json(
          {
            code: "IDEMPOTENCY_CONFLICT",
            message:
              "Permintaan ini sudah digunakan untuk kiriman yang berbeda. Muat ulang halaman lalu coba lagi.",
          },
          { status: 409 },
        );
      }

      if (!("credentials" in submission)) {
        throw new Error("Unexpected submission result.");
      }

      const { credentials } = submission;

      return json(
        {
          trackingCode: credentials.trackingCode,
          trackingPath: credentials.trackingPath,
        },
        { status: submission.kind === "created" ? 201 : 200 },
      );
    } catch (error) {
      logRequestFailure("submission", error);
      return json(
        {
          code: "SERVICE_UNAVAILABLE",
          message: "Menfess belum dapat dikirim. Coba lagi nanti.",
        },
        { status: 503 },
      );
    }
  };
}

export function createTrackingHandler(dependencies: PublicApiDependencies) {
  return async function POST(request: Request) {
    try {
      const body = await readJson(request);

      if (body.kind !== "json") {
        return bodyError(body.kind);
      }

      const parsed = trackingPayloadSchema.safeParse(body.value);

      if (!parsed.success) {
        return json(
          { code: "NOT_FOUND", message: "Kode pelacakan tidak ditemukan." },
          { status: 404 },
        );
      }

      const identity = dependencies.identifyClient(request, "tracking");
      const rateLimit = await dependencies.consumeRateLimit(
        "tracking",
        identity.digest,
        identity.keyVersion,
      );

      if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit);
      }

      const status = await dependencies.findPublicStatus(parsed.data.token);

      if (!status) {
        return json(
          { code: "NOT_FOUND", message: "Kode pelacakan tidak ditemukan." },
          { status: 404 },
        );
      }

      return json({ status }, { status: 200 });
    } catch (error) {
      logRequestFailure("tracking", error);
      return json(
        {
          code: "SERVICE_UNAVAILABLE",
          message: "Status belum dapat diperiksa. Coba lagi nanti.",
        },
        { status: 503 },
      );
    }
  };
}
