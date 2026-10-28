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

  function requestKey() {
    return `bmi_${randomBytes(32).toString("base64url")}`;
  }

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
    const submitted = await repository.submitMenfess(
      "curhat",
      message,
      requestKey(),
    );

    expect(submitted.kind).toBe("created");
    if (!("credentials" in submitted)) throw new Error("Submission failed.");
    const { credentials } = submitted;
    expect(credentials.trackingCode).toMatch(/^BM-/);
    expect(credentials.trackingUrlToken).toMatch(/^bmu_/);

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
      await repository.submitMenfess(
        "not-a-category",
        `${testPrefix} invalid`,
        requestKey(),
      ),
    ).toEqual({ kind: "category-unavailable" });
    expect(
      await owner.menfess.count({
        where: { message: `${testPrefix} invalid` },
      }),
    ).toBe(0);
  });

  it("collapses concurrent retries while allowing intentional identical messages", async () => {
    const message = `${testPrefix} idempotent submission`;
    const sharedKey = requestKey();
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.submitMenfess("curhat", message, sharedKey),
      ),
    );

    expect(concurrent.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(concurrent.filter((result) => result.kind === "replayed")).toHaveLength(7);
    expect(await owner.menfess.count({ where: { message } })).toBe(1);
    const firstCredential = concurrent.find(
      (result) => "credentials" in result,
    );
    if (!firstCredential || !("credentials" in firstCredential)) {
      throw new Error("Concurrent submission returned no credentials.");
    }
    expect(
      concurrent
        .filter((result) => "credentials" in result)
        .map((result) =>
          "credentials" in result ? result.credentials.trackingCode : null,
        ),
    ).toEqual(Array(8).fill(firstCredential.credentials.trackingCode));

    const distinct = await repository.submitMenfess(
      "curhat",
      message,
      requestKey(),
    );
    expect(distinct.kind).toBe("created");
    expect(await owner.menfess.count({ where: { message } })).toBe(2);
  });

  it("replays only inside 24 hours and conflicts at the expiry boundary", async () => {
    const message = `${testPrefix} replay boundary`;
    const key = requestKey();
    expect((await repository.submitMenfess("curhat", message, key)).kind).toBe("created");
    expect((await repository.submitMenfess("curhat", message, key)).kind).toBe("replayed");

    await owner.$executeRaw`
      UPDATE app_private.menfess
      SET submitted_at = clock_timestamp() - INTERVAL '24 hours'
      WHERE message = ${message}
    `;

    expect((await repository.submitMenfess("curhat", message, key)).kind).toBe(
      "idempotency-conflict",
    );
    expect(await owner.menfess.count({ where: { message } })).toBe(1);
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

  it("enforces administrator login limits and recovers in a fresh window", async () => {
    const digest = randomBytes(32);
    const decisions = await Promise.all(
      Array.from({ length: 16 }, () =>
        repository.consumeRateLimit("admin-login", digest, 1),
      ),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    const saturated = await owner.$queryRaw<Array<{ request_count: number }>>`
      SELECT request_count
      FROM app_private.rate_limit_bucket
      WHERE scope = 'admin-login'
        AND identifier_key_version = 1
        AND identifier_digest = ${digest}
    `;
    expect(saturated[0]?.request_count).toBe(6);

    await owner.$executeRaw`
      UPDATE app_private.rate_limit_bucket
      SET window_started_at = window_started_at - interval '15 minutes',
          expires_at = expires_at - interval '15 minutes'
      WHERE scope = 'admin-login'
        AND identifier_key_version = 1
        AND identifier_digest = ${digest}
    `;

    await expect(
      repository.consumeRateLimit("admin-login", digest, 1),
    ).resolves.toMatchObject({ allowed: true, remaining: 4 });
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

    const security = await owner.$queryRaw<
      Array<{
        table_owner: string;
        row_security: boolean;
        function_owner: string;
        security_definer: boolean;
        function_config: string | null;
        public_execute: boolean;
        anon_execute: boolean;
        authenticated_execute: boolean;
        service_role_execute: boolean;
        runtime_execute: boolean;
      }>
    >`
      SELECT
        table_owner.rolname AS table_owner,
        bucket.relrowsecurity AS row_security,
        function_owner.rolname AS function_owner,
        limiter.prosecdef AS security_definer,
        array_to_string(limiter.proconfig, ',') AS function_config,
        EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              limiter.proacl,
              pg_catalog.acldefault('f', limiter.proowner)
            )
          ) AS function_acl
          WHERE function_acl.grantee = 0
            AND function_acl.privilege_type = 'EXECUTE'
        ) AS public_execute,
        has_function_privilege('anon', limiter.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege(
          'authenticated',
          limiter.oid,
          'EXECUTE'
        ) AS authenticated_execute,
        has_function_privilege(
          'service_role',
          limiter.oid,
          'EXECUTE'
        ) AS service_role_execute,
        has_function_privilege(
          'bawean_app',
          limiter.oid,
          'EXECUTE'
        ) AS runtime_execute
      FROM pg_catalog.pg_class AS bucket
      JOIN pg_catalog.pg_namespace AS bucket_namespace
        ON bucket_namespace.oid = bucket.relnamespace
      JOIN pg_catalog.pg_roles AS table_owner
        ON table_owner.oid = bucket.relowner
      CROSS JOIN pg_catalog.pg_proc AS limiter
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = limiter.pronamespace
      JOIN pg_catalog.pg_roles AS function_owner
        ON function_owner.oid = limiter.proowner
      WHERE bucket_namespace.nspname = 'app_private'
        AND bucket.relname = 'rate_limit_bucket'
        AND function_namespace.nspname = 'app_private'
        AND limiter.proname = 'consume_rate_limit'
        AND pg_catalog.pg_get_function_identity_arguments(limiter.oid)
          = 'p_scope text, p_identifier_digest bytea, p_identifier_key_version smallint'
    `;
    expect(security[0]).toMatchObject({
      table_owner: "postgres",
      row_security: true,
      function_owner: "postgres",
      security_definer: true,
      public_execute: false,
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: false,
      runtime_execute: true,
    });
    expect(security[0]?.function_config).toContain('search_path=""');
  });
});
