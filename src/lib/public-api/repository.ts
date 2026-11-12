import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  PublicCategory,
  PublicMenfessStatus,
  RateLimitDecision,
  RateLimitScope,
  SubmissionRepositoryResult,
} from "@/lib/public-api/contracts";
import {
  createTrackingCredentialPairForIdempotency,
  digestCredential,
  loadD2Secrets,
  parseTrackingCredential,
} from "@/lib/public-api/security";

type PublicDatabase = Pick<
  PrismaClient,
  "$queryRaw" | "$transaction" | "category" | "menfess"
>;

export type StagedPhoto = { id: string; contentSha256: Uint8Array<ArrayBuffer> };

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    meta?: {
      code?: string;
      driverAdapterError?: {
        cause?: { originalCode?: string };
      };
    };
  };
  const postgresCode =
    candidate.meta?.code ??
    candidate.meta?.driverAdapterError?.cause?.originalCode;

  return (
    candidate.code === "P2002" ||
    candidate.code === "23505" ||
    (candidate.code === "P2010" && postgresCode === "23505")
  );
}

export function createPublicMenfessRepository(database: PublicDatabase) {
  return {
    async listActiveCategories(): Promise<PublicCategory[]> {
      return database.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, label: true },
      });
    },

    async consumeRateLimit(
      scope: RateLimitScope,
      identifierDigest: Buffer,
      identifierKeyVersion: number,
    ): Promise<RateLimitDecision> {
      const rows = await database.$queryRaw<RateLimitRow[]>`
        SELECT allowed, remaining, retry_after_seconds
        FROM app_private.consume_rate_limit(
          ${scope},
          ${identifierDigest},
          ${identifierKeyVersion}::smallint
        )
      `;
      const row = rows[0];

      if (!row) {
        throw new Error("The rate-limit function returned no decision.");
      }

      return {
        allowed: row.allowed,
        remaining: row.remaining,
        retryAfterSeconds: row.retry_after_seconds,
      };
    },

    async submitMenfess(
      categorySlug: string,
      message: string,
      idempotencyKey: string,
      photo?: StagedPhoto,
    ): Promise<SubmissionRepositoryResult> {
      const { trackingCodeKey, trackingUrlKey } = loadD2Secrets();
      const credentials = createTrackingCredentialPairForIdempotency(
        idempotencyKey,
        trackingCodeKey,
        trackingUrlKey,
      );

      try {
        const inserted = photo
          ? await database.$transaction(async (transaction) => {
              const rows = await transaction.$queryRaw<Array<{ id: string }>>`
                INSERT INTO app_private.menfess (
                  category_id, message, tracking_code_digest,
                  tracking_code_key_version, tracking_url_digest,
                  tracking_url_key_version, updated_at
                )
                SELECT category.id, ${message}, ${credentials.trackingCodeDigest},
                  ${credentials.trackingCodeKeyVersion}::smallint,
                  ${credentials.trackingUrlDigest},
                  ${credentials.trackingUrlKeyVersion}::smallint,
                  clock_timestamp()
                FROM app_private.category AS category
                WHERE category.slug = ${categorySlug} AND category.is_active = true
                RETURNING id
              `;
              if (!rows[0]) return [];
              const attached = await transaction.menfessPhoto.updateMany({
                where: { id: photo.id, state: "STAGED", menfessId: null, contentSha256: photo.contentSha256 },
                data: { menfessId: rows[0].id, state: "ATTACHED", updatedAt: new Date() },
              });
              if (attached.count !== 1) throw new Error("Staged photo was not available.");
              return [{ inserted: true }];
            })
          : await database.$queryRaw<Array<{ inserted: boolean }>>`
            INSERT INTO app_private.menfess (
              category_id,
              message,
              tracking_code_digest,
              tracking_code_key_version,
              tracking_url_digest,
              tracking_url_key_version,
              updated_at
            )
            SELECT
              category.id,
              ${message},
              ${credentials.trackingCodeDigest},
              ${credentials.trackingCodeKeyVersion}::smallint,
              ${credentials.trackingUrlDigest},
              ${credentials.trackingUrlKeyVersion}::smallint,
              clock_timestamp()
            FROM app_private.category AS category
            WHERE category.slug = ${categorySlug}
              AND category.is_active = true
            RETURNING true AS inserted
          `;

        return inserted[0]?.inserted
          ? { kind: "created", credentials }
          : { kind: "category-unavailable" };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const [existing] = await database.$queryRaw<
          Array<{ message: string; category_slug: string; replayable: boolean; photo_digest: Uint8Array | null }>
        >`
          SELECT
            menfess.message,
            category.slug AS category_slug,
            menfess.submitted_at >= clock_timestamp() - INTERVAL '24 hours'
              AS replayable,
            photo.content_sha256 AS photo_digest
          FROM app_private.menfess AS menfess
          JOIN app_private.category AS category ON category.id = menfess.category_id
          LEFT JOIN app_private.menfess_photo AS photo ON photo.menfess_id = menfess.id
          WHERE menfess.tracking_code_digest = ${credentials.trackingCodeDigest}
            AND menfess.tracking_code_key_version = ${credentials.trackingCodeKeyVersion}::smallint
            AND menfess.tracking_url_digest = ${credentials.trackingUrlDigest}
            AND menfess.tracking_url_key_version = ${credentials.trackingUrlKeyVersion}::smallint
          LIMIT 1
        `;

        return existing?.replayable === true &&
          existing.message === message &&
          existing.category_slug === categorySlug &&
          (photo
            ? existing.photo_digest !== null &&
              Buffer.from(existing.photo_digest).equals(photo.contentSha256)
            : existing.photo_digest === null)
          ? { kind: "replayed", credentials }
          : { kind: "idempotency-conflict" };
      }
    },

    async findPublicStatus(
      rawCredential: string,
    ): Promise<PublicMenfessStatus | null> {
      const credential = parseTrackingCredential(rawCredential);

      if (!credential) {
        return null;
      }

      const { trackingCodeKey, trackingUrlKey } = loadD2Secrets();
      const isCode = credential.kind === "code";
      const digest = digestCredential(
        credential.normalized,
        isCode ? trackingCodeKey : trackingUrlKey,
      );
      const menfess = await database.menfess.findFirst({
        where: isCode
          ? { trackingCodeDigest: digest, trackingCodeKeyVersion: 1 }
          : { trackingUrlDigest: digest, trackingUrlKeyVersion: 1 },
        select: { status: true },
      });

      return menfess?.status ?? null;
    },
  };
}

export type PublicMenfessRepository = ReturnType<
  typeof createPublicMenfessRepository
>;
