import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  createAdminModerationRepository,
  ModerationError,
} from "../../src/lib/admin-moderation";
import { createPublicMenfessRepository } from "../../src/lib/public-api/repository";

const databaseName = "bawean_d1_test";
const prefix = `P6 moderation ${randomUUID()}`;

function requiredLocalConnection(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const role = decodeURIComponent(url.username);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.pathname !== `/${databaseName}` ||
    (name === "POSTGRES_TEST_OWNER_URL" && role !== "postgres") ||
    (name === "DATABASE_URL" && !role.startsWith("bawean_app"))
  ) {
    throw new Error(`${name} must target the isolated PostgreSQL test database.`);
  }
  return value;
}

function prismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString, max: 6, ssl: false },
      { schema: "app_private" },
    ),
  });
}

describe("moderation workflow on PostgreSQL 17", () => {
  const owner = prismaClient(requiredLocalConnection("POSTGRES_TEST_OWNER_URL"));
  const runtime = prismaClient(requiredLocalConnection("DATABASE_URL"));
  const moderation = createAdminModerationRepository(runtime);
  const publicRepository = createPublicMenfessRepository(runtime);
  const adminId = randomUUID();
  const memberId = randomUUID();

  beforeAll(async () => {
    await owner.user.create({
      data: {
        id: adminId,
        name: "P6 Test Administrator",
        email: `p6-admin-${adminId}@example.test`,
        emailVerified: true,
        role: "admin",
      },
    });
    await owner.user.create({
      data: {
        id: memberId,
        name: "P6 Test Member",
        email: `p6-member-${memberId}@example.test`,
        role: "none",
      },
    });
  });

  afterAll(async () => {
    await Promise.all([runtime.$disconnect(), owner.$disconnect()]);
  });

  async function submission(label: string) {
    const message = `${prefix} ${label}`;
    const result = await publicRepository.submitMenfess(
      "curhat",
      message,
      `bmi_${randomBytes(32).toString("base64url")}`,
    );
    if (!("credentials" in result)) {
      throw new Error("Test category is unavailable.");
    }
    const stored = await owner.menfess.findFirstOrThrow({
      where: { message },
      select: { id: true },
    });
    return { id: stored.id, credentials: result.credentials };
  }

  it("approves and publishes with matching append-only audit history and tracking state", async () => {
    const { id, credentials } = await submission("approve and publish");
    await expect(
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "APPROVE",
        expectedVersion: 0,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", version: 1 });
    await expect(
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "PUBLISH",
        expectedVersion: 1,
        publicationReference:
          "https://www.instagram.com/p/AbCdEf12345/",
      }),
    ).resolves.toMatchObject({ status: "PUBLISHED", version: 2 });

    expect(await publicRepository.findPublicStatus(credentials.trackingCode)).toBe(
      "PUBLISHED",
    );
    const detail = await moderation.detail(id);
    expect(detail?.moderationLogs.map((log) => log.action)).toEqual([
      "MARK_PUBLISHED",
      "APPROVE",
    ]);
    expect(detail?.moderationLogs.map((log) => log.actor.name)).toEqual([
      "P6 Test Administrator",
      "P6 Test Administrator",
    ]);
    expect(detail?.publishedAt).toBeInstanceOf(Date);
    expect(detail?.publicationReference).toBe(
      "https://www.instagram.com/p/AbCdEf12345/",
    );
    expect(detail?.moderationLogs[0]?.note).toBe(
      "Referensi Instagram: https://www.instagram.com/p/AbCdEf12345/",
    );
  });

  it("records publication removal separately without changing lifecycle status", async () => {
    const { id } = await submission("publication removal");
    await moderation.moderate({ id, actorUserId: adminId, action: "APPROVE", expectedVersion: 0 });
    await moderation.moderate({ id, actorUserId: adminId, action: "PUBLISH", expectedVersion: 1 });
    await moderation.recordPublicationRemoval({
      id,
      actorUserId: adminId,
      reason: "Affected party request reviewed and Instagram post removed.",
    });

    const detail = await moderation.detail(id);
    expect(detail?.status).toBe("PUBLISHED");
    expect(detail?.version).toBe(2);
    expect(detail?.publicationRemoval?.reason).toContain("Affected party");
    await expect(
      moderation.recordPublicationRemoval({ id, actorUserId: adminId, reason: "duplicate" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.publicationRemoval.updateMany({ where: { menfessId: id }, data: { reason: "tampered" } }),
    ).rejects.toThrow();
  });

  it("rejects actions that violate the existing status lifecycle", async () => {
    const { id } = await submission("invalid transition");
    await expect(
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "PUBLISH",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("requires and records a rejection reason without exposing it to tracking", async () => {
    const { id, credentials } = await submission("mandatory rejection reason");
    await expect(
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "REJECT",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await moderation.moderate({
      id,
      actorUserId: adminId,
      action: "REJECT",
      expectedVersion: 0,
      reason: "Pesan tidak sesuai aturan komunitas.",
    });

    expect(await publicRepository.findPublicStatus(credentials.trackingCode)).toBe(
      "REJECTED",
    );
    const detail = await moderation.detail(id);
    expect(detail?.moderationLogs[0]?.note).toBe(
      "Pesan tidak sesuai aturan komunitas.",
    );
  });

  it("serializes concurrent decisions and rejects stale versions without duplicate logs", async () => {
    const { id } = await submission("concurrent action");
    const results = await Promise.allSettled([
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "APPROVE",
        expectedVersion: 0,
      }),
      moderation.moderate({
        id,
        actorUserId: adminId,
        action: "REJECT",
        expectedVersion: 0,
        reason: "Keputusan paralel.",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(ModerationError);
      expect(rejected.reason.code).toBe("CONFLICT");
    }
    const finalState = await owner.menfess.findUniqueOrThrow({
      where: { id },
      select: { version: true },
    });
    expect(finalState.version).toBe(1);
    expect(await owner.moderationLog.count({ where: { menfessId: id } })).toBe(1);
  });

  it("rolls back a status update if database audit authorization rejects the actor", async () => {
    const { id } = await submission("rollback on audit rejection");
    await expect(
      moderation.moderate({
        id,
        actorUserId: memberId,
        action: "APPROVE",
        expectedVersion: 0,
      }),
    ).rejects.toThrow();

    const persisted = await owner.menfess.findUniqueOrThrow({
      where: { id },
      select: { status: true, version: true },
    });
    expect(persisted).toEqual({ status: "PENDING", version: 0 });
    expect(await owner.moderationLog.count({ where: { menfessId: id } })).toBe(0);
  });

  it("keeps moderation history append-only for runtime and owner operations", async () => {
    const { id } = await submission("append-only audit");
    await moderation.moderate({
      id,
      actorUserId: adminId,
      action: "APPROVE",
      expectedVersion: 0,
    });
    const log = await owner.moderationLog.findFirstOrThrow({
      where: { menfessId: id },
      select: { id: true },
    });

    await expect(
      runtime.moderationLog.updateMany({
        where: { id: log.id },
        data: { note: "tampered" },
      }),
    ).rejects.toThrow();
    await expect(
      runtime.moderationLog.deleteMany({ where: { id: log.id } }),
    ).rejects.toThrow();
    await expect(
      owner.$executeRaw`TRUNCATE TABLE app_private.moderation_log`,
    ).rejects.toThrow();
    expect(await owner.moderationLog.count({ where: { menfessId: id } })).toBe(1);
  });

  it("lists submissions with status, category, message search, sort, and pagination filters", async () => {
    const pending = await submission("filter searchable phrase");
    const approved = await submission("filter approved phrase");
    await moderation.moderate({
      id: approved.id,
      actorUserId: adminId,
      action: "APPROVE",
      expectedVersion: 0,
    });
    const result = await moderation.list({
      page: 1,
      pageSize: 1,
      status: "PENDING",
      category: "curhat",
      search: "searchable phrase",
      sort: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(pending.id);
    expect(result.items[0]).not.toHaveProperty("trackingCodeDigest");
  });

  it("reports approved and published lifecycle counts separately", async () => {
    const before = await moderation.dashboard();
    const pending = await submission("dashboard pending");
    const approved = await submission("dashboard approved");
    const published = await submission("dashboard published");
    const rejected = await submission("dashboard rejected");

    await moderation.moderate({
      id: approved.id,
      actorUserId: adminId,
      action: "APPROVE",
      expectedVersion: 0,
    });
    await moderation.moderate({
      id: published.id,
      actorUserId: adminId,
      action: "APPROVE",
      expectedVersion: 0,
    });
    await moderation.moderate({
      id: published.id,
      actorUserId: adminId,
      action: "PUBLISH",
      expectedVersion: 1,
    });
    await moderation.moderate({
      id: rejected.id,
      actorUserId: adminId,
      action: "REJECT",
      expectedVersion: 0,
      reason: "Dashboard test rejection.",
    });

    const after = await moderation.dashboard();
    expect(after.stats).toEqual({
      total: before.stats.total + 4,
      pending: before.stats.pending + 1,
      approved: before.stats.approved + 1,
      published: before.stats.published + 1,
      rejected: before.stats.rejected + 1,
    });
    expect(pending.id).toBeTruthy();
  });
});
