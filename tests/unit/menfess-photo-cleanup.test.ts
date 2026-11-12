import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Row = { id: string; menfessId: string | null; objectPath: string; state: string; updatedAt: Date; retentionQueuedAt?: Date | null };
  return {
    rows: new Map<string, Row>(),
    retentionEligible: true,
    deleteFailure: false,
    remove: vi.fn<(_paths: string[]) => Promise<{ error: Error | null }>>(),
  };
});

vi.mock("@/lib/prisma", () => {
  const menfessPhoto = {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; menfessId?: string; state: string } }) => {
        const row = [...mocks.rows.values()].find((row) =>
          (where.id === undefined || row.id === where.id) &&
          (where.menfessId === undefined || row.menfessId === where.menfessId) &&
          row.state === where.state);
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async () => {
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1_000);
        return [...mocks.rows.values()]
          .filter((row) => ["DELETE_PENDING", "RETENTION_PENDING"].includes(row.state) ||
            (["STAGED", "CLEANING"].includes(row.state) && row.updatedAt < cutoff))
          .map((row) => ({ ...row }));
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; state: string; updatedAt?: { lt: Date }; retentionQueuedAt?: { not: null } }; data: Partial<{ state: string; updatedAt: Date; menfessId: string | null }> }) => {
        const row = mocks.rows.get(where.id);
        if (!row || row.state !== where.state ||
          (where.updatedAt && row.updatedAt >= where.updatedAt.lt) ||
          (where.retentionQueuedAt && !row.retentionQueuedAt)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; state: string } }) => {
        if (mocks.deleteFailure) {
          mocks.deleteFailure = false;
          throw new Error("database unavailable");
        }
        const row = mocks.rows.get(where.id);
        if (!row || row.state !== where.state) return { count: 0 };
        mocks.rows.delete(where.id);
        return { count: 1 };
      }),
  };
  return { prisma: {
    menfessPhoto,
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(async () => mocks.retentionEligible ? [{ id: menfessId }] : []),
        menfessPhoto,
      })),
  } };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ remove: mocks.remove }) } }),
}));

import { cleanupPhotoForMenfess, discardStagedPhoto, reconcilePhotos } from "../../src/lib/menfess-photo-service";

const id = "11111111-1111-4111-8111-111111111111";
const menfessId = "22222222-2222-4222-8222-222222222222";
const path = `photos/${id}.png`;
const previousUrl = process.env.SUPABASE_URL;
const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  mocks.rows.clear();
  mocks.retentionEligible = true;
  mocks.deleteFailure = false;
  mocks.remove.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  if (previousUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
});

describe("photo cleanup reconciliation", () => {
  it("keeps a pending or approved attachment out of abandoned-upload cleanup", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "ATTACHED", updatedAt: new Date(0) });
    expect(await reconcilePhotos()).toEqual({ removed: 0, failed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rows.has(id)).toBe(true);
  });

  it("retains a failed terminal deletion and retries it successfully", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "DELETE_PENDING", updatedAt: new Date() });
    mocks.remove.mockResolvedValueOnce({ error: new Error("storage unavailable") });
    await expect(cleanupPhotoForMenfess(menfessId)).rejects.toThrow("storage unavailable");
    expect(mocks.rows.get(id)?.state).toBe("DELETE_PENDING");
    expect(await reconcilePhotos()).toEqual({ removed: 1, failed: 0 });
    expect(mocks.rows.has(id)).toBe(false);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("removes a stale unassociated upload without touching another object", async () => {
    mocks.rows.set(id, { id, menfessId: null, objectPath: path, state: "STAGED", updatedAt: new Date(0) });
    expect(await reconcilePhotos()).toEqual({ removed: 1, failed: 0 });
    expect(mocks.remove).toHaveBeenCalledWith([path]);
    expect(mocks.rows.has(id)).toBe(false);
    await discardStagedPhoto(id);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("does not delete an ineligible held retention photo", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "RETENTION_PENDING", updatedAt: new Date(), retentionQueuedAt: new Date() });
    mocks.retentionEligible = false;
    expect(await reconcilePhotos()).toEqual({ removed: 0, failed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rows.get(id)?.state).toBe("RETENTION_PENDING");
  });

  it("retries a failed retention deletion without losing its reference", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "RETENTION_PENDING", updatedAt: new Date(), retentionQueuedAt: new Date() });
    mocks.remove.mockResolvedValueOnce({ error: new Error("storage unavailable") });
    expect(await reconcilePhotos()).toEqual({ removed: 0, failed: 1 });
    expect(mocks.rows.get(id)?.state).toBe("RETENTION_PENDING");
    expect(await reconcilePhotos()).toEqual({ removed: 1, failed: 0 });
    expect(mocks.rows.get(id)?.state).toBe("RETENTION_CLEANED");
  });

  it("reconciles a Storage success followed by a database failure without a duplicate claim", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "DELETE_PENDING", updatedAt: new Date() });
    mocks.deleteFailure = true;
    expect(await reconcilePhotos()).toEqual({ removed: 0, failed: 1 });
    expect(mocks.rows.get(id)?.state).toBe("CLEANING");
    expect(await reconcilePhotos()).toEqual({ removed: 0, failed: 0 });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    mocks.rows.get(id)!.updatedAt = new Date(0);
    expect(await reconcilePhotos()).toEqual({ removed: 1, failed: 0 });
    expect(mocks.rows.has(id)).toBe(false);
  });

  it("does not issue duplicate Storage deletes for concurrent workers", async () => {
    mocks.rows.set(id, { id, menfessId, objectPath: path, state: "DELETE_PENDING", updatedAt: new Date() });
    await Promise.all([reconcilePhotos(), reconcilePhotos()]);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.rows.has(id)).toBe(false);
  });
});
