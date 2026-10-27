import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createAuthOptions } from "../../src/lib/auth-options";
import { createAuthRouteHandlers } from "../../src/lib/auth-route";
import { bootstrapFirstAdmin } from "../../scripts/admin/bootstrap-core.mjs";

const { Client } = pg;
const databaseName = "bawean_admin_bootstrap_test";
const baseUrl = "http://localhost:3000";
const password = `First-admin-${randomUUID()}-${randomUUID()}`;
const email = `first-admin-${randomUUID()}@example.test`;
const displayName = "First Bootstrap Administrator";
const environment = {
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  BETTER_AUTH_URL: baseUrl,
  NODE_ENV: "test",
};

function localConnection(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const role = decodeURIComponent(url.username);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.pathname !== `/${databaseName}` ||
    (name === "BOOTSTRAP_TEST_OWNER_URL" && role !== "postgres") ||
    (name === "BOOTSTRAP_TEST_RUNTIME_URL" && !role.startsWith("bawean_app"))
  ) {
    throw new Error(`${name} must target the disposable bootstrap test database.`);
  }
  return value;
}

function runtimeClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString, max: 2, ssl: false },
      { schema: "app_private" },
    ),
  });
}

function signInRequest() {
  return new Request(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      Origin: baseUrl,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
}

describe("first administrator offline bootstrap", () => {
  const ownerUrl = localConnection("BOOTSTRAP_TEST_OWNER_URL");
  const runtimeUrl = localConnection("BOOTSTRAP_TEST_RUNTIME_URL");
  const runtime = runtimeClient(runtimeUrl);
  const auth = betterAuth(
    createAuthOptions(
      environment,
      prismaAdapter(runtime, { provider: "postgresql" }),
      [],
    ),
  );
  const authHandlers = createAuthRouteHandlers(auth);
  let adminId: string | undefined;

  beforeAll(async () => {
    const owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      const result = await owner.query(
        "SELECT count(*)::int AS count FROM app_private.auth_user WHERE role = 'admin'",
      );
      expect(result.rows[0]?.count).toBe(0);
    } finally {
      await owner.end();
    }
  });

  afterAll(async () => {
    await runtime.$disconnect();
    if (!adminId) return;
    const owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      await owner.query("DELETE FROM app_private.auth_user WHERE id = $1", [
        adminId,
      ]);
    } finally {
      await owner.end();
    }
  });

  it("allows exactly one winner when bootstrap is invoked concurrently", async () => {
    const attempt = async () => {
      const client = new Client({ connectionString: ownerUrl });
      await client.connect();
      try {
        return await bootstrapFirstAdmin(client, {
          name: displayName,
          email,
          password,
        });
      } finally {
        await client.end();
      }
    };
    const results = await Promise.allSettled([attempt(), attempt()]);
    const succeeded = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (succeeded[0]?.status !== "fulfilled") {
      throw new Error("Concurrent bootstrap did not produce a winner.");
    }
    adminId = succeeded[0].value.id;

    const owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      const result = await owner.query(
        `SELECT id, name, email, role, email_verified
         FROM app_private.auth_user
         WHERE role = 'admin'`,
      );
      expect(result.rowCount).toBe(1);
      expect(result.rows[0]).toMatchObject({
        id: adminId,
        name: displayName,
        email,
        role: "admin",
        email_verified: true,
      });
    } finally {
      await owner.end();
    }
  });

  it("refuses a second bootstrap after the initial administrator exists", async () => {
    const owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      await expect(
        bootstrapFirstAdmin(owner, {
          name: displayName,
          email: `second-${email}`,
          password,
        }),
      ).rejects.toMatchObject({ code: "ADMIN_ALREADY_EXISTS" });
    } finally {
      await owner.end();
    }
  });

  it("uses Better Auth-compatible password hashing and signs in successfully", async () => {
    const owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      const result = await owner.query(
        `SELECT a.password
         FROM app_private.auth_account AS a
         WHERE a.user_id = $1 AND a.provider_id = 'credential'`,
        [adminId],
      );
      const passwordHash = result.rows[0]?.password;
      expect(typeof passwordHash).toBe("string");
      if (typeof passwordHash !== "string") {
        throw new Error("Bootstrap did not persist a credential hash.");
      }
      expect(
        await verifyPassword({ hash: passwordHash, password }),
      ).toBe(true);
    } finally {
      await owner.end();
    }

    const response = await authHandlers.POST(signInRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });
});
