import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createPublicMenfessRepository } from "../../src/lib/public-api/repository";

const databaseName = "bawean_d1_test";

function requiredLocalConnection(name: string) {
  const value = process.env[name];

  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.pathname !== `/${databaseName}`
  ) {
    throw new Error(`${name} must target the isolated local test database.`);
  }
  return value;
}

function client(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString, max: 12, ssl: false },
      { schema: "app_private" },
    ),
  });
}

describe("anonymous menfess PostgreSQL integration", () => {
  const owner = client(requiredLocalConnection("POSTGRES_TEST_OWNER_URL"));
  const runtime = client(requiredLocalConnection("DATABASE_URL"));
  const repository = createPublicMenfessRepository(runtime);
  const testPrefix = `D2 integration ${randomUUID()}`;

  beforeAll(async () => {
    const identity = await runtime.$queryRaw<
      Array<{ database_name: string; role_name: string; version_num: string }>
    >`
      SELECT current_database() AS database_name,
        current_user AS role_name,
        current_setting('server_version_num') AS version_num
    `;
    expect(identity[0]).toMatchObject({
      database_name: databaseName,
      role_name: "bawean_app",
    });
    expect(Number(identity[0]?.version_num)).toBeGreaterThanOrEqual(170000);
    expect(Number(identity[0]?.version_num)).toBeLessThan(180000);
  });

  afterAll(async () => {
    await owner.menfess.deleteMany({
      where: { message: { startsWith: testPrefix } },
    });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  });

  it("reads the five active database-backed categories", async () => {
    expect(await repository.listActiveCategories()).toEqual([
      { slug: "confess", label: "Confess" },
      { slug: "curhat", label: "Curhat" },
      { slug: "ask-bm", label: "Ask BM" },
      { slug: "connect", label: "Connect" },
      { slug: "discuss", label: "Discuss" },
    ]);
  });

  it("atomically inserts PENDING menfess and resolves both private credentials", async () => {
    const message = `${testPrefix} valid submission`;
    const credentials = await repository.submitMenfess("curhat", message);

    expect(credentials).not.toBeNull();
    expect(credentials?.trackingCode).toMatch(/^BM-/);
    expect(credentials?.trackingUrlToken).toMatch(/^bmu_/);

    const stored = await owner.menfess.findFirstOrThrow({
      where: { message },
      select: {
        status: true,
        trackingCodeDigest: true,
        trackingUrlDigest: true,
        trackingCodeKeyVersion: true,
        trackingUrlKeyVersion: true,
      },
    });
    expect(stored).toMatchObject({
      status: "PENDING",
      trackingCodeKeyVersion: 1,
      trackingUrlKeyVersion: 1,
    });
    expect(stored.trackingCodeDigest).toHaveLength(32);
    expect(stored.trackingUrlDigest).toHaveLength(32);
    expect(
      await repository.findPublicStatus(credentials!.trackingCode),
    ).toBe("PENDING");
    expect(
      await repository.findPublicStatus(credentials!.trackingUrlToken),
    ).toBe("PENDING");
  });

  it("does not insert when a category is missing or inactive", async () => {
    expect(
      await repository.submitMenfess("not-a-category", `${testPrefix} invalid`),
    ).toBeNull();
    expect(
      await owner.menfess.count({
        where: { message: `${testPrefix} invalid` },
      }),
    ).toBe(0);
  });

  it("enforces submission limits atomically under concurrency", async () => {
    const digest = randomBytes(32);
    const results = await Promise.all(
      Array.from({ length: 24 }, () =>
        repository.consumeRateLimit("submission", digest, 1),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    const stored = await owner.$queryRaw<
      Array<{ request_count: number; updated_at: Date; xmin: string }>
    >`
      SELECT request_count, updated_at, xmin::text AS xmin
      FROM app_private.rate_limit_bucket
      WHERE scope = 'submission'
        AND identifier_key_version = 1
        AND identifier_digest = ${digest}
    `;
    expect(stored[0]?.request_count).toBe(6);

    await Promise.all(
      Array.from({ length: 12 }, () =>
        repository.consumeRateLimit("submission", digest, 1),
      ),
    );
    const after = await owner.$queryRaw<
      Array<{ request_count: number; updated_at: Date; xmin: string }>
    >`
      SELECT request_count, updated_at, xmin::text AS xmin
      FROM app_private.rate_limit_bucket
      WHERE scope = 'submission'
        AND identifier_key_version = 1
        AND identifier_digest = ${digest}
    `;
    expect(after[0]).toEqual(stored[0]);
  });

  it("starts a fresh allowance after an expired fixed window", async () => {
    const digest = randomBytes(32);
    await owner.$executeRaw`
      INSERT INTO app_private.rate_limit_bucket (
        scope,
        identifier_key_version,
        identifier_digest,
        window_started_at,
        request_count,
        expires_at,
        updated_at
      ) VALUES (
        'tracking',
        1,
        ${digest},
        clock_timestamp() - interval '20 minutes',
        31,
        clock_timestamp() - interval '10 minutes',
        clock_timestamp() - interval '10 minutes'
      )
    `;

    const result = await repository.consumeRateLimit("tracking", digest, 1);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rejects invalid rate-limit function inputs", async () => {
    await expect(
      runtime.$queryRaw`
        SELECT * FROM app_private.consume_rate_limit(
          'unknown',
          ${randomBytes(32)},
          1::smallint
        )
      `,
    ).rejects.toThrow();
    await expect(
      runtime.$queryRaw`
        SELECT * FROM app_private.consume_rate_limit(
          'submission',
          ${randomBytes(31)},
          1::smallint
        )
      `,
    ).rejects.toThrow();
    await expect(
      runtime.$queryRaw`
        SELECT * FROM app_private.consume_rate_limit(
          'submission',
          ${randomBytes(32)},
          0::smallint
        )
      `,
    ).rejects.toThrow();
  });

  it("keeps rate-limit state private while exposing only function execution", async () => {
    const privileges = await runtime.$queryRaw<
      Array<{ table_access: boolean; function_access: boolean }>
    >`
      SELECT
        has_table_privilege(
          current_user,
          'app_private.rate_limit_bucket',
          'SELECT,INSERT,UPDATE,DELETE'
        ) AS table_access,
        has_function_privilege(
          current_user,
          'app_private.consume_rate_limit(text,bytea,smallint)',
          'EXECUTE'
        ) AS function_access
    `;
    expect(privileges[0]).toEqual({
      table_access: false,
      function_access: true,
    });
    await expect(
      runtime.$queryRaw`SELECT * FROM app_private.rate_limit_bucket`,
    ).rejects.toThrow();
  });
});
