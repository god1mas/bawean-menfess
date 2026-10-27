import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";
export type ModerationAction = "APPROVE" | "REJECT" | "PUBLISH";
const transitions = {
  APPROVE: { from: "PENDING", to: "APPROVED" },
  REJECT: { from: "PENDING", to: "REJECTED" },
  PUBLISH: { from: "APPROVED", to: "PUBLISHED" },
} as const satisfies Record<
  ModerationAction,
  { from: ModerationStatus; to: ModerationStatus }
>;

export type ModerationQuery = {
  page: number;
  pageSize: number;
  status?: ModerationStatus;
  category?: string;
  search?: string;
  sort: "asc" | "desc";
};

export class ModerationError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_TRANSITION" | "REASON_REQUIRED",
  ) {
    super(code);
    this.name = "ModerationError";
  }
}

type ModerationDatabase = Pick<
  PrismaClient,
  "$transaction" | "category" | "menfess" | "moderationLog"
>;

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

function queueWhere(query: ModerationQuery) {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.search
      ? { message: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };
}

export function createAdminModerationRepository(database: ModerationDatabase) {
  return {
    async dashboard() {
      const [total, pending, approved, published, rejected, categories, recent] =
        await Promise.all([
          database.menfess.count(),
          database.menfess.count({ where: { status: "PENDING" } }),
          database.menfess.count({ where: { status: "APPROVED" } }),
          database.menfess.count({ where: { status: "PUBLISHED" } }),
          database.menfess.count({ where: { status: "REJECTED" } }),
          database.category.findMany({
            orderBy: { sortOrder: "asc" },
            select: { slug: true, label: true, isActive: true },
          }),
          database.moderationLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              action: true,
              fromStatus: true,
              toStatus: true,
              note: true,
              createdAt: true,
              menfessId: true,
              actor: { select: { name: true } },
            },
          }),
        ]);

      return {
        stats: {
          total,
          pending,
          approvedPublished: approved + published,
          rejected,
        },
        categories,
        recentActivity: recent,
      };
    },

    async list(query: ModerationQuery) {
      const where = queueWhere(query);
      const [total, items] = await Promise.all([
        database.menfess.count({ where }),
        database.menfess.findMany({
          where,
          orderBy: [
            { submittedAt: query.sort },
            { id: query.sort },
          ],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            message: true,
            status: true,
            version: true,
            submittedAt: true,
            category: { select: { slug: true, label: true } },
          },
        }),
      ]);

      return {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: Math.ceil(total / query.pageSize),
      };
    },

    async detail(id: string) {
      return database.menfess.findUnique({
        where: { id },
        select: {
          id: true,
          message: true,
          status: true,
          version: true,
          submittedAt: true,
          updatedAt: true,
          publishedAt: true,
          publicationReference: true,
          category: { select: { slug: true, label: true } },
          moderationLogs: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              action: true,
              fromStatus: true,
              toStatus: true,
              note: true,
              createdAt: true,
              actor: { select: { name: true } },
            },
          },
        },
      });
    },

    async moderate(input: {
      id: string;
      actorUserId: string;
      action: ModerationAction;
      expectedVersion: number;
      reason?: string;
    }) {
      if (
        input.action === "REJECT" &&
        !input.reason?.trim()
      ) {
        throw new ModerationError("REASON_REQUIRED");
      }

      try {
        return await database.$transaction(async (transaction) => {
          const current = await transaction.menfess.findUnique({
            where: { id: input.id },
            select: { status: true, version: true },
          });

          if (!current) {
            throw new ModerationError("NOT_FOUND");
          }
          if (current.version !== input.expectedVersion) {
            throw new ModerationError("CONFLICT");
          }

          const transition = transitions[input.action];

          if (current.status !== transition.from) {
            throw new ModerationError("INVALID_TRANSITION");
          }

          const nextStatus = transition.to;
          const now = new Date();
          const updated = await transaction.menfess.updateMany({
            where: {
              id: input.id,
              status: current.status,
              version: input.expectedVersion,
            },
            data: {
              status: nextStatus,
              version: { increment: 1 },
              updatedAt: now,
              ...(input.action === "PUBLISH"
                ? { publishedAt: now, publicationReference: null }
                : {}),
            },
          });

          if (updated.count !== 1) {
            throw new ModerationError("CONFLICT");
          }

          await transaction.$executeRaw`
            INSERT INTO app_private.moderation_log (
              menfess_id,
              actor_user_id,
              idempotency_key,
              action,
              from_status,
              to_status,
              note
            )
            VALUES (
              ${input.id}::uuid,
              ${input.actorUserId}::uuid,
              ${randomUUID()}::uuid,
              ${input.action === "PUBLISH" ? "MARK_PUBLISHED" : input.action}::app_private."ModerationAction",
              ${current.status}::app_private."MenfessStatus",
              ${nextStatus}::app_private."MenfessStatus",
              ${input.reason?.trim() || null}
            )
          `;

          return { id: input.id, status: nextStatus, version: input.expectedVersion + 1 };
        });
      } catch (error) {
        if (error instanceof ModerationError) {
          throw error;
        }
        if (isUniqueViolation(error)) {
          throw new ModerationError("CONFLICT");
        }
        throw error;
      }
    },
  };
}

export type AdminModerationRepository = ReturnType<
  typeof createAdminModerationRepository
>;
