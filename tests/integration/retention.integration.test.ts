import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createPublicMenfessRepository } from "../../src/lib/public-api/repository";

const databaseName = "bawean_d1_test";

function connection(name: "POSTGRES_TEST_OWNER_URL" | "DATABASE_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== `/${databaseName}`) {
    throw new Error(`${name} must target the isolated test database.`);
  }
  return value;
}

function client(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 6, ssl: false }, { schema: "app_private" }),
  });
}

describe("owner-only retention on PostgreSQL 17", () => {
  const owner = client(connection("POSTGRES_TEST_OWNER_URL"));
  const runtime = client(connection("DATABASE_URL"));
  const publicRepository = createPublicMenfessRepository(runtime);

  afterAll(async () => Promise.all([owner.$disconnect(), runtime.$disconnect()]));

  async function submit(label: string) {
    const message = `P7 retention ${label} ${randomUUID()}`;
    const result = await publicRepository.submitMenfess(
      "curhat",
      message,
      `bmi_${randomBytes(32).toString("base64url")}`,
    );
    if (!("credentials" in result)) throw new Error("Submission failed.");
    const row = await owner.menfess.findFirstOrThrow({ where: { message }, select: { id: true } });
    return { id: row.id, credentials: result.credentials };
  }

  it("denies cleanup and legal-hold mutation to the runtime role", async () => {
    await expect(runtime.$queryRaw`SELECT * FROM app_private.run_retention_cleanup(1)`).rejects.toThrow();
    await expect(runtime.$queryRaw`SELECT app_private.set_menfess_legal_hold(${randomUUID()}::uuid, 'forged')::text`).rejects.toThrow();
    await expect(runtime.$executeRaw`
      UPDATE app_private.menfess SET legal_hold_at = clock_timestamp(), legal_hold_reason = 'forged'
    `).rejects.toThrow();
  });

  it("deletes only eligible unlocked records and expires their tracking credentials", async () => {
    const expired = await submit("expired");
    const held = await submit("held");
    const fresh = await submit("fresh");
    await owner.$executeRaw`
      UPDATE app_private.menfess
      SET submitted_at = clock_timestamp() - INTERVAL '91 days'
      WHERE id IN (${expired.id}::uuid, ${held.id}::uuid)
    `;
    await owner.$queryRaw`
      SELECT app_private.set_menfess_legal_hold(${held.id}::uuid, 'isolated test hold')::text
    `;

    const [result] = await owner.$queryRaw<Array<{ menfess_deleted: number }>>`
      SELECT * FROM app_private.run_retention_cleanup(500)
    `;
    expect(result?.menfess_deleted).toBeGreaterThanOrEqual(1);
    expect(await owner.menfess.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await owner.menfess.findUnique({ where: { id: held.id } })).not.toBeNull();
    expect(await owner.menfess.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await publicRepository.findPublicStatus(expired.credentials.trackingCode)).toBeNull();
    await owner.$queryRaw`SELECT app_private.release_menfess_legal_hold(${held.id}::uuid)::text`;
  });

  it("cleans expired limiter rows in bounded batches and stores count-only evidence", async () => {
    const digest = randomBytes(32);
    await owner.$executeRaw`
      INSERT INTO app_private.rate_limit_bucket (
        scope, identifier_key_version, identifier_digest, window_started_at,
        request_count, expires_at, updated_at
      ) VALUES (
        'tracking', 1, ${digest}, clock_timestamp() - INTERVAL '1 hour',
        1, clock_timestamp() - INTERVAL '1 minute', clock_timestamp()
      )
    `;
    const [result] = await owner.$queryRaw<Array<{ rate_limit_rows_deleted: number }>>`
      SELECT * FROM app_private.run_retention_cleanup(1)
    `;
    expect(result?.rate_limit_rows_deleted).toBe(1);
    const [evidence] = await owner.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM app_private.retention_cleanup_run ORDER BY started_at DESC LIMIT 1
    `;
    expect(evidence).toBeDefined();
    expect(Object.keys(evidence ?? {})).not.toContain("message");
  });

  it("rejects invalid batches without leaving cleanup evidence", async () => {
    const before = await owner.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM app_private.retention_cleanup_run
    `;
    await expect(owner.$queryRaw`SELECT * FROM app_private.run_retention_cleanup(0)`).rejects.toThrow();
    const after = await owner.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM app_private.retention_cleanup_run
    `;
    expect(after[0]?.count).toBe(before[0]?.count);
  });
});
