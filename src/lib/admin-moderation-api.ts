import { z } from "zod";
import type { AdminAuthorization } from "@/lib/admin-authorization";
import { normalizeInstagramPublicationReference } from "@/lib/instagram-publication";
import {
  ModerationError,
  type AdminModerationRepository,
  type ModerationQuery,
} from "@/lib/admin-moderation";

const MAX_BODY_BYTES = 4_096;
const statuses = ["PENDING", "APPROVED", "REJECTED", "PUBLISHED"] as const;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(2_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(statuses).optional(),
  category: z.string().trim().min(1).max(32).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["asc", "desc"]).default("desc"),
});
const actionSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT", "PUBLISH", "REMOVE_PUBLICATION"]),
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().max(1_000).optional(),
    publicationReference: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (["REJECT", "REMOVE_PUBLICATION"].includes(value.action) && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Alasan penolakan wajib diisi.",
      });
    }
    if (!["REJECT", "REMOVE_PUBLICATION"].includes(value.action) && value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Alasan hanya dapat diisi saat menolak kiriman.",
      });
    }
    if (value.action !== "PUBLISH" && value.publicationReference) {
      context.addIssue({
        code: "custom",
        path: ["publicationReference"],
        message: "Referensi publikasi hanya dapat diisi saat publikasi.",
      });
    }
    if (
      value.action === "PUBLISH" &&
      normalizeInstagramPublicationReference(value.publicationReference) === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["publicationReference"],
        message: "Gunakan tautan posting Instagram yang valid.",
      });
    }
  });

export type AdminModerationApiDependencies = {
  resolveAuthorization: (headers: Headers) => Promise<AdminAuthorization>;
  repository: AdminModerationRepository;
  baseUrl?: string;
  nodeEnv?: string;
};

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: responseHeaders });
}

function logFailure(operation: string, error: unknown) {
  console.error("[admin-moderation] Request failed", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

async function authorizationResponse(
  request: Request,
  dependencies: AdminModerationApiDependencies,
): Promise<
  | { authorized: false; response: Response }
  | {
      authorized: true;
      authorization: Extract<AdminAuthorization, { kind: "authorized" }>;
    }
> {
  const authorization = await dependencies.resolveAuthorization(request.headers);

  if (authorization.kind === "unauthenticated") {
    return { authorized: false, response: json({ error: "Unauthorized." }, 401) };
  }
  if (authorization.kind === "forbidden") {
    return { authorized: false, response: json({ error: "Forbidden." }, 403) };
  }

  return { authorized: true, authorization };
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function validMutationOrigin(
  request: Request,
  dependencies: AdminModerationApiDependencies,
) {
  const origin = request.headers.get("origin");
  const baseUrl = dependencies.baseUrl;

  if (!origin || !baseUrl) {
    return false;
  }

  try {
    const supplied = new URL(origin);
    const expected = new URL(baseUrl);

    if (supplied.origin === expected.origin) {
      return true;
    }

    if (dependencies.nodeEnv === "production") {
      return false;
    }

    const requestUrl = new URL(request.url);
    return (
      isLoopback(supplied.hostname) &&
      isLoopback(expected.hostname) &&
      supplied.protocol === expected.protocol &&
      supplied.port === expected.port &&
      requestUrl.port === supplied.port
    );
  } catch {
    return false;
  }
}

async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return { kind: "unsupported" } as const;
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
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
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return { kind: "too-large" } as const;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return {
      kind: "json",
      value: JSON.parse(Buffer.concat(chunks, byteLength).toString("utf8")) as unknown,
    } as const;
  } catch {
    return { kind: "invalid" } as const;
  }
}

function moderationErrorResponse(error: ModerationError) {
  switch (error.code) {
    case "NOT_FOUND":
      return json({ error: "Menfess tidak ditemukan." }, 404);
    case "REASON_REQUIRED":
      return json(
        { error: "Alasan penolakan wajib diisi.", field: "reason" },
        400,
      );
    case "INVALID_TRANSITION":
      return json({ error: "Aksi tidak tersedia untuk status saat ini." }, 409);
    case "CONFLICT":
      return json(
        { error: "Data berubah atau aksi ini sudah diproses. Muat ulang antrean." },
        409,
      );
    default:
      return json({ error: "Aksi moderasi belum dapat diproses." }, 409);
  }
}

export function createAdminModerationHandlers(
  dependencies: AdminModerationApiDependencies,
) {
  return {
    async list(request: Request): Promise<Response> {
      try {
        const access = await authorizationResponse(request, dependencies);
        if (!access.authorized) return access.response;

        const url = new URL(request.url);
        const parsed = querySchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsed.success) {
          return json({ error: "Filter antrean tidak valid." }, 400);
        }

        const query: ModerationQuery = {
          ...parsed.data,
          ...(parsed.data.category ? { category: parsed.data.category } : {}),
          ...(parsed.data.search ? { search: parsed.data.search } : {}),
        };
        const [dashboard, queue] = await Promise.all([
          dependencies.repository.dashboard(),
          dependencies.repository.list(query),
        ]);

        return json({ ...dashboard, queue }, 200);
      } catch (error) {
        logFailure("list", error);
        return json({ error: "Data moderasi belum dapat dimuat." }, 503);
      }
    },

    async detail(request: Request, id: string): Promise<Response> {
      try {
        const access = await authorizationResponse(request, dependencies);
        if (!access.authorized) return access.response;
        if (!z.string().uuid().safeParse(id).success) {
          return json({ error: "Menfess tidak ditemukan." }, 404);
        }

        const item = await dependencies.repository.detail(id);
        return item
          ? json(
              {
                item: {
                  ...item,
                  trackingCredentials: "Kode dan token pelacakan tidak dapat dipulihkan.",
                },
              },
              200,
            )
          : json({ error: "Menfess tidak ditemukan." }, 404);
      } catch (error) {
        logFailure("detail", error);
        return json({ error: "Detail menfess belum dapat dimuat." }, 503);
      }
    },

    async action(request: Request, id: string): Promise<Response> {
      if (!validMutationOrigin(request, dependencies)) {
        return json({ error: "Origin permintaan tidak diizinkan." }, 403);
      }

      try {
        const access = await authorizationResponse(request, dependencies);
        if (!access.authorized) return access.response;
        if (!z.string().uuid().safeParse(id).success) {
          return json({ error: "Menfess tidak ditemukan." }, 404);
        }

        const body = await readJson(request);
        if (body.kind !== "json") {
          const status = body.kind === "unsupported" ? 415 : body.kind === "too-large" ? 413 : 400;
          return json({ error: "Permintaan moderasi tidak valid." }, status);
        }

        const parsed = actionSchema.safeParse(body.value);
        if (!parsed.success) {
          return json(
            {
              error: "Periksa kembali aksi moderasi.",
              fields: parsed.error.flatten().fieldErrors,
            },
            400,
          );
        }

        const publicationReference = normalizeInstagramPublicationReference(
          parsed.data.publicationReference,
        );
        const result = parsed.data.action === "REMOVE_PUBLICATION"
          ? await dependencies.repository.recordPublicationRemoval({
              id,
              actorUserId: access.authorization.user.id,
              reason: parsed.data.reason ?? "",
            })
          : await dependencies.repository.moderate({
              id,
              actorUserId: access.authorization.user.id,
              action: parsed.data.action,
              expectedVersion: parsed.data.expectedVersion,
              ...(parsed.data.action === "REJECT" && parsed.data.reason
                ? { reason: parsed.data.reason }
                : {}),
              ...(publicationReference ? { publicationReference } : {}),
            });

        return json({ result }, 200);
      } catch (error) {
        if (error instanceof ModerationError) {
          return moderationErrorResponse(error);
        }
        logFailure("action", error);
        return json({ error: "Aksi moderasi belum dapat disimpan." }, 503);
      }
    },
  };
}
