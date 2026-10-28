import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AdminAuthorization } from "../../src/lib/admin-authorization";
import type { AdminModerationRepository } from "../../src/lib/admin-moderation";
import { createAdminModerationHandlers } from "../../src/lib/admin-moderation-api";

const admin = { kind: "authorized", user: { id: randomUUID(), name: "Admin" } } as const;
const submissionId = randomUUID();

function repository() {
  const value: AdminModerationRepository = {
    dashboard: vi.fn(async () => ({
      stats: { total: 0, pending: 0, approved: 0, published: 0, rejected: 0 },
      categories: [],
      recentActivity: [],
    })),
    list: vi.fn(async (query) => ({
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: 0,
    })),
    detail: vi.fn(async () => null),
    recordPublicationRemoval: vi.fn(async (input) => ({
      menfessId: input.id,
      removedAt: new Date(0),
    })),
    moderate: vi.fn(
      async (
        input: Parameters<AdminModerationRepository["moderate"]>[0],
      ): Promise<
        Awaited<ReturnType<AdminModerationRepository["moderate"]>>
      > => {
        const status =
          input.action === "APPROVE"
            ? "APPROVED"
            : input.action === "REJECT"
              ? "REJECTED"
              : "PUBLISHED";
        return {
          id: input.id,
          status,
          version: input.expectedVersion + 1,
        };
      },
    ),
  };
  return value;
}

function handler(
  authorization: AdminAuthorization,
  overrides: { baseUrl?: string; nodeEnv?: string } = {},
) {
  const data = repository();
  const instance = createAdminModerationHandlers({
    resolveAuthorization: vi.fn(async () => authorization),
    repository: data,
    baseUrl: overrides.baseUrl ?? "https://menfess.example",
    nodeEnv: overrides.nodeEnv ?? "production",
  });
  return { instance, data };
}

function actionRequest(body: unknown, origin = "https://menfess.example") {
  return new Request(`${origin}/api/admin/moderation/${submissionId}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin moderation API authorization and validation", () => {
  it("returns 401 for an unauthenticated queue request without reading records", async () => {
    const { instance, data } = handler({ kind: "unauthenticated" });
    const response = await instance.list(
      new Request("https://menfess.example/api/admin/moderation"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(data.dashboard).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-admin before any mutation", async () => {
    const { instance, data } = handler({ kind: "forbidden" });
    const response = await instance.action(
      actionRequest({ action: "APPROVE", expectedVersion: 0 }),
      submissionId,
    );

    expect(response.status).toBe(403);
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations before session authorization", async () => {
    const resolveAuthorization = vi.fn(async () => admin);
    const data = repository();
    const instance = createAdminModerationHandlers({
      resolveAuthorization,
      repository: data,
      baseUrl: "https://menfess.example",
      nodeEnv: "production",
    });
    const response = await instance.action(
      actionRequest(
        { action: "APPROVE", expectedVersion: 0 },
        "https://attacker.example",
      ),
      submissionId,
    );

    expect(response.status).toBe(403);
    expect(resolveAuthorization).not.toHaveBeenCalled();
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it("requires a rejection reason and rejects browser-supplied actor identity", async () => {
    const { instance, data } = handler(admin);
    const noReason = await instance.action(
      actionRequest({ action: "REJECT", expectedVersion: 0 }),
      submissionId,
    );
    const forgedActor = await instance.action(
      actionRequest({
        action: "APPROVE",
        expectedVersion: 0,
        actorUserId: randomUUID(),
      }),
      submissionId,
    );

    expect(noReason.status).toBe(400);
    expect(forgedActor.status).toBe(400);
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it("uses the authorized session identity for database audit records", async () => {
    const { instance, data } = handler(admin);
    const response = await instance.action(
      actionRequest({
        action: "REJECT",
        expectedVersion: 4,
        reason: "Tidak sesuai aturan.",
      }),
      submissionId,
    );

    expect(response.status).toBe(200);
    expect(data.moderate).toHaveBeenCalledWith({
      id: submissionId,
      actorUserId: admin.user.id,
      action: "REJECT",
      expectedVersion: 4,
      reason: "Tidak sesuai aturan.",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("normalizes safe Instagram publication links and permits omission", async () => {
    const { instance, data } = handler(admin);
    const withReference = await instance.action(
      actionRequest({
        action: "PUBLISH",
        expectedVersion: 2,
        publicationReference:
          "https://instagram.com/reel/AbCdEf12345/?utm_source=test#fragment",
      }),
      submissionId,
    );
    const withoutReference = await instance.action(
      actionRequest({ action: "PUBLISH", expectedVersion: 3 }),
      submissionId,
    );

    expect(withReference.status).toBe(200);
    expect(withoutReference.status).toBe(200);
    expect(data.moderate).toHaveBeenNthCalledWith(1, {
      id: submissionId,
      actorUserId: admin.user.id,
      action: "PUBLISH",
      expectedVersion: 2,
      publicationReference:
        "https://www.instagram.com/reel/AbCdEf12345/",
    });
    expect(data.moderate).toHaveBeenNthCalledWith(2, {
      id: submissionId,
      actorUserId: admin.user.id,
      action: "PUBLISH",
      expectedVersion: 3,
    });
  });

  it("rejects rejection reasons on non-rejection actions", async () => {
    const { instance, data } = handler(admin);
    const response = await instance.action(
      actionRequest({
        action: "APPROVE",
        expectedVersion: 1,
        reason: "Catatan yang tidak semestinya.",
      }),
      submissionId,
    );

    expect(response.status).toBe(400);
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it("records a publication removal separately with a mandatory reason", async () => {
    const { instance, data } = handler(admin);
    const missing = await instance.action(
      actionRequest({ action: "REMOVE_PUBLICATION", expectedVersion: 2 }),
      submissionId,
    );
    expect(missing.status).toBe(400);

    const response = await instance.action(
      actionRequest({
        action: "REMOVE_PUBLICATION",
        expectedVersion: 2,
        reason: "Affected-party report verified.",
      }),
      submissionId,
    );
    expect(response.status).toBe(200);
    expect(data.recordPublicationRemoval).toHaveBeenCalledWith({
      id: submissionId,
      actorUserId: admin.user.id,
      reason: "Affected-party report verified.",
    });
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it.each([
    "javascript:alert(1)",
    "http://www.instagram.com/p/AbCdEf12345/",
    "https://instagram.example/p/AbCdEf12345/",
    "https://www.instagram.com/accounts/login/",
  ])("rejects unsafe publication reference %s", async (publicationReference) => {
    const { instance, data } = handler(admin);
    const response = await instance.action(
      actionRequest({
        action: "PUBLISH",
        expectedVersion: 1,
        publicationReference,
      }),
      submissionId,
    );

    expect(response.status).toBe(400);
    expect(data.moderate).not.toHaveBeenCalled();
  });

  it("validates pagination and filters before database access", async () => {
    const { instance, data } = handler(admin);
    const response = await instance.list(
      new Request(
        "https://menfess.example/api/admin/moderation?page=0&status=INVALID",
      ),
    );

    expect(response.status).toBe(400);
    expect(data.list).not.toHaveBeenCalled();
  });

  it("accepts only same-origin loopback aliases during local development", async () => {
    const { instance, data } = handler(admin, {
      baseUrl: "http://localhost:3000",
      nodeEnv: "development",
    });
    const response = await instance.action(
      actionRequest(
        { action: "APPROVE", expectedVersion: 0 },
        "http://127.0.0.1:3000",
      ),
      submissionId,
    );

    expect(response.status).toBe(200);
    expect(data.moderate).toHaveBeenCalledOnce();
  });
});
