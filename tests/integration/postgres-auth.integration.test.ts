import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  createAdminAuthorizationResolver,
  createAdminSessionHandler,
} from "../../src/lib/admin-authorization";
import { createAuthOptions } from "../../src/lib/auth-options";
import { createAuthRouteHandlers } from "../../src/lib/auth-route";

const databaseName = "bawean_d1_test";
const projectReference = "hqupjaaagwpafeuwyixe";
const adminPassword = `Admin-${randomUUID()}-${randomUUID()}`;
const memberPassword = `Member-${randomUUID()}-${randomUUID()}`;
const unknownEmail = `unknown-${randomUUID()}@example.test`;
const environment = {
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  BETTER_AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
};

function requiredLocalConnection(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for PostgreSQL integration tests.`);
  }

  const url = new URL(value);
  const role = decodeURIComponent(url.username);

  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.pathname !== `/${databaseName}` ||
    url.hostname.includes(projectReference) ||
    role === "postgres" && name !== "POSTGRES_TEST_OWNER_URL" ||
    role !== "postgres" && name === "POSTGRES_TEST_OWNER_URL" ||
    name === "DATABASE_URL" && !role.startsWith("bawean_app")
  ) {
    throw new Error(`${name} must target the isolated local test database.`);
  }

  return value;
}

function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg(
    {
      connectionString,
      connectionTimeoutMillis: 5_000,
      max: 2,
      ssl: false,
    },
    { schema: "app_private" },
  );

  return new PrismaClient({ adapter });
}

function request(path: string, method = "POST", body?: unknown, cookie?: string) {
  const headers = new Headers({
    Origin: environment.BETTER_AUTH_URL!,
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  return new Request(`${environment.BETTER_AUTH_URL}/api/auth${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function cookieFrom(response: Response) {
  const cookie = response.headers.getSetCookie()[0]?.split(";", 1)[0];

  if (!cookie) {
    throw new Error("Better Auth did not return a session cookie.");
  }

  return cookie;
}

describe("PostgreSQL 17 Better Auth integration", () => {
  const ownerUrl = requiredLocalConnection("POSTGRES_TEST_OWNER_URL");
  const runtimeUrl = requiredLocalConnection("DATABASE_URL");
  const owner = createPrismaClient(ownerUrl);
  const runtime = createPrismaClient(runtimeUrl);
  const auth = betterAuth(
    createAuthOptions(
      environment,
      prismaAdapter(runtime, { provider: "postgresql" }),
      [],
    ),
  );
  const handlers = createAuthRouteHandlers(auth);
  const fixtureAuth = betterAuth({
    ...createAuthOptions(
      environment,
      prismaAdapter(runtime, { provider: "postgresql" }),
      [],
    ),
    databaseHooks: undefined,
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
  });

  let adminId: string;
  let memberId: string;
  let adminEmail: string;
  let memberEmail: string;
  let adminCookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    const identity = await owner.$queryRaw<
      Array<{
        database_name: string;
        server_version_num: string;
        runtime_can_insert_user: boolean;
      }>
    >`
      SELECT current_database() AS database_name,
        current_setting('server_version_num') AS server_version_num,
        has_table_privilege('bawean_app', 'app_private.auth_user', 'INSERT')
          AS runtime_can_insert_user
    `;
    expect(identity[0]?.database_name).toBe(databaseName);
    expect(Number(identity[0]?.server_version_num)).toBeGreaterThanOrEqual(170000);
    expect(Number(identity[0]?.server_version_num)).toBeLessThan(180000);
    expect(identity[0]?.runtime_can_insert_user).toBe(false);

    adminEmail = `admin-${randomUUID()}@example.test`;
    memberEmail = `member-${randomUUID()}@example.test`;
    adminId = randomUUID();
    memberId = randomUUID();

    for (const [id, email, password, role] of [
      [adminId, adminEmail, adminPassword, "admin"],
      [memberId, memberEmail, memberPassword, "none"],
    ] as const) {
      const passwordHash = await hashPassword(password);
      await owner.user.create({
        data: {
          id,
          name: role === "admin" ? "Integration Admin" : "Integration Member",
          email,
          emailVerified: true,
          role,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: id,
              providerId: "credential",
              password: passwordHash,
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    if (adminId && memberId) {
      await owner.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
    }
    await Promise.all([runtime.$disconnect(), owner.$disconnect()]);
  });

  it("reads provisioned user and credential account through the runtime role", async () => {
    const user = await runtime.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, role: true },
    });
    const account = await runtime.account.findFirst({
      where: { userId: adminId },
      select: { providerId: true, password: true },
    });

    expect(user).toEqual({ id: adminId, role: "admin" });
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
  });

  it("authenticates a provisioned admin using the runtime Prisma adapter", async () => {
    const response = await handlers.POST(
      request("/sign-in/email", "POST", {
        email: adminEmail,
        password: adminPassword,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("session_token");
    adminCookie = cookieFrom(response);
  });

  it("rejects an invalid password with a generic response", async () => {
    const response = await handlers.POST(
      request("/sign-in/email", "POST", {
        email: adminEmail,
        password: `${adminPassword}-invalid`,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Email atau kata sandi tidak valid.",
    });
  });

  it("rejects an unknown account without disclosing its existence", async () => {
    const response = await handlers.POST(
      request("/sign-in/email", "POST", {
        email: unknownEmail,
        password: adminPassword,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(unknownEmail);
  });

  it("does not create a session for a non-admin", async () => {
    const response = await handlers.POST(
      request("/sign-in/email", "POST", {
        email: memberEmail,
        password: memberPassword,
      }),
    );

    expect(response.status).toBe(401);
    expect(await runtime.session.count({ where: { userId: memberId } })).toBe(0);
  });

  it("rejects public signup before attempting user creation", async () => {
    const response = await handlers.POST(
      request("/sign-up/email", "POST", {
        name: "Visitor",
        email: `visitor-${randomUUID()}@example.test`,
        password: adminPassword,
      }),
    );

    expect(response.status).toBe(404);
    const direct = await auth.handler(
      request("/sign-up/email", "POST", {
        name: "Visitor",
        email: `visitor-${randomUUID()}@example.test`,
        password: adminPassword,
      }),
    );
    expect(direct.status).toBe(400);
  });

  it("does not expose social sign-in routes", async () => {
    const response = await handlers.POST(
      request("/sign-in/social", "POST", { provider: "google" }),
    );

    expect(response.status).toBe(404);
  });

  it("retrieves a valid admin session without exposing private fields", async () => {
    const response = await handlers.GET(
      request("/get-session", "GET", undefined, adminCookie),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      user: { id: adminId, name: "Integration Admin" },
    });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("role");
  });

  it("invalidates the admin session on logout", async () => {
    const response = await handlers.POST(
      request("/sign-out", "POST", undefined, adminCookie),
    );

    expect(response.status).toBe(200);
    const session = await handlers.GET(
      request("/get-session", "GET", undefined, adminCookie),
    );
    expect(await session.json()).toBeNull();
  });

  it("rejects expired and invalid sessions", async () => {
    const login = await handlers.POST(
      request("/sign-in/email", "POST", {
        email: adminEmail,
        password: adminPassword,
      }),
    );
    const expiredCookie = cookieFrom(login);

    await owner.session.updateMany({
      where: { userId: adminId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await handlers.GET(
      request("/get-session", "GET", undefined, expiredCookie),
    );
    const invalid = await handlers.GET(
      request("/get-session", "GET", undefined, "better-auth.session_token=invalid"),
    );

    expect(await expired.json()).toBeNull();
    expect(await invalid.json()).toBeNull();
  });

  it("rejects runtime auth_user insert and role modification", async () => {
    await expect(
      runtime.user.create({
        data: {
          name: "Unauthorized",
          email: `unauthorized-${randomUUID()}@example.test`,
        },
      }),
    ).rejects.toThrow();

    await expect(
      runtime.user.update({
        where: { id: adminId },
        data: { role: "none" },
      }),
    ).rejects.toThrow();
  });

  it("returns 401 from the admin API without a session", async () => {
    const resolve = createAdminAuthorizationResolver({
      getSession: async (headers) => {
        const session = await auth.api.getSession({ headers });
        return session
          ? { user: { id: session.user.id, name: session.user.name } }
          : null;
      },
      findRole: async (userId) =>
        (await runtime.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }))?.role ?? null,
    });
    const response = await createAdminSessionHandler(resolve)(
      new Request("http://localhost/api/admin/session"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for a valid session whose database role is non-admin", async () => {
    const response = await fixtureAuth.handler(
      request("/sign-in/email", "POST", {
        email: memberEmail,
        password: memberPassword,
      }),
    );
    expect(response.status).toBe(200);
    memberCookie = cookieFrom(response);

    const resolve = createAdminAuthorizationResolver({
      getSession: async (headers) => {
        const session = await auth.api.getSession({ headers });
        return session
          ? { user: { id: session.user.id, name: session.user.name } }
          : null;
      },
      findRole: async (userId) =>
        (await runtime.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }))?.role ?? null,
    });
    const responseForMember = await createAdminSessionHandler(resolve)(
      new Request("http://localhost/api/admin/session", {
        headers: { Cookie: memberCookie },
      }),
    );

    expect(responseForMember.status).toBe(403);
  });

  it("preserves the approved least-privilege runtime grants", async () => {
    const grants = await runtime.$queryRaw<
      Array<{
        can_use_schema: boolean;
        can_create_schema: boolean;
        can_select_users: boolean;
        can_insert_users: boolean;
        can_update_role: boolean;
        can_session_insert: boolean;
        can_audit_update: boolean;
      }>
    >`
      SELECT
        has_schema_privilege(current_user, 'app_private', 'USAGE') AS can_use_schema,
        has_schema_privilege(current_user, 'app_private', 'CREATE') AS can_create_schema,
        has_table_privilege(current_user, 'app_private.auth_user', 'SELECT') AS can_select_users,
        has_table_privilege(current_user, 'app_private.auth_user', 'INSERT') AS can_insert_users,
        has_column_privilege(current_user, 'app_private.auth_user', 'role', 'UPDATE') AS can_update_role,
        has_table_privilege(current_user, 'app_private.auth_session', 'INSERT') AS can_session_insert,
        has_table_privilege(current_user, 'app_private.moderation_log', 'UPDATE') AS can_audit_update,
        has_function_privilege(
          current_user,
          'app_private.prevent_moderation_log_mutation()',
          'EXECUTE'
        ) AS can_execute_trigger_function
    `;

    expect(grants[0]).toEqual({
      can_use_schema: true,
      can_create_schema: false,
      can_select_users: true,
      can_insert_users: false,
      can_update_role: false,
      can_session_insert: true,
      can_audit_update: false,
      can_execute_trigger_function: false,
    });
  });

  it("keeps runtime role attributes restricted and ownership-free", async () => {
    const role = await runtime.$queryRaw<
      Array<{
        can_login: boolean;
        is_superuser: boolean;
        can_create_database: boolean;
        can_create_role: boolean;
        can_replicate: boolean;
        bypasses_rls: boolean;
        inherits: boolean;
        has_memberships: boolean;
        owns_app_objects: boolean;
      }>
    >`
      SELECT
        r.rolcanlogin AS can_login,
        r.rolsuper AS is_superuser,
        r.rolcreatedb AS can_create_database,
        r.rolcreaterole AS can_create_role,
        r.rolreplication AS can_replicate,
        r.rolbypassrls AS bypasses_rls,
        r.rolinherit AS inherits,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members m
          WHERE m.member = r.oid
        ) AS has_memberships,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relowner = r.oid AND n.nspname = 'app_private'
        ) OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace n
          WHERE n.nspname = 'app_private' AND n.nspowner = r.oid
        ) OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_proc p
          JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app_private' AND p.proowner = r.oid
        ) OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_type t
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'app_private' AND t.typowner = r.oid
        ) AS owns_app_objects
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = current_user
    `;

    expect(role[0]).toEqual({
      can_login: true,
      is_superuser: false,
      can_create_database: false,
      can_create_role: false,
      can_replicate: false,
      bypasses_rls: false,
      inherits: false,
      has_memberships: false,
      owns_app_objects: false,
    });
  });

  it("keeps app_private inaccessible to Supabase API roles and PUBLIC", async () => {
    const access = await runtime.$queryRaw<
      Array<{
        anon: boolean;
        authenticated: boolean;
        service_role: boolean;
        public_has_usage: boolean;
      }>
    >`
      SELECT
        has_schema_privilege('anon', 'app_private', 'USAGE') AS anon,
        has_schema_privilege('authenticated', 'app_private', 'USAGE') AS authenticated,
        has_schema_privilege('service_role', 'app_private', 'USAGE') AS service_role,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace n
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
          ) acl
          WHERE n.nspname = 'app_private' AND acl.grantee = 0 AND acl.privilege_type = 'USAGE'
        ) AS public_has_usage
    `;

    expect(access[0]).toEqual({
      anon: false,
      authenticated: false,
      service_role: false,
      public_has_usage: false,
    });
  });
});
