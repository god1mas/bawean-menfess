import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAuthOptions,
  validateAuthEnvironment,
} from "../../src/lib/auth-options";
import { createAuthRouteHandlers } from "../../src/lib/auth-route";

const testEnvironment = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
};
const adminPassword = randomBytes(24).toString("base64url");
const memberPassword = randomBytes(24).toString("base64url");
const invalidPassword = randomBytes(24).toString("base64url");

type AuthHarness = ReturnType<typeof createAuthHarness>;

function createAuthHarness() {
  const database: MemoryDB = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const adapter = memoryAdapter(database);
  const options = createAuthOptions(testEnvironment, adapter, []);
  const provisioner = betterAuth({
    ...options,
    databaseHooks: undefined,
    emailAndPassword: {
      ...options.emailAndPassword,
      enabled: true,
      disableSignUp: false,
    },
  });
  const auth = betterAuth(options);

  return {
    auth,
    database,
    provisioner,
    routes: createAuthRouteHandlers(auth),
  };
}

async function provisionUser(
  harness: AuthHarness,
  email: string,
  password: string,
  role: "admin" | "none",
) {
  const response = await harness.provisioner.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({ name: "Test User", email, password }),
    }),
  );
  expect(response.status).toBe(200);

  const user = harness.database.user!.find((record) => record.email === email);
  expect(user).toBeDefined();

  if (!user) {
    throw new Error("Test provisioning did not create a user.");
  }

  user.role = role;
}

function signInRequest(email: string, password: string) {
  return new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ email, password }),
  });
}

function sessionCookie(response: Response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  expect(value).toBeTruthy();
  return value as string;
}

describe("admin-only Better Auth configuration", () => {
  let harness: AuthHarness;

  beforeEach(() => {
    harness = createAuthHarness();
  });

  it("validates required secrets and enforces secure production configuration", () => {
    expect(() =>
      validateAuthEnvironment({
        BETTER_AUTH_SECRET: "too-short",
        BETTER_AUTH_URL: testEnvironment.BETTER_AUTH_URL,
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      validateAuthEnvironment({
        BETTER_AUTH_SECRET: testEnvironment.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: "not a URL",
      }),
    ).toThrow(/BETTER_AUTH_URL/);

    expect(() =>
      validateAuthEnvironment({
        BETTER_AUTH_SECRET: testEnvironment.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: "http://example.com",
        NODE_ENV: "production",
      }),
    ).toThrow(/HTTPS/);

    const productionOptions = createAuthOptions(
      {
        ...testEnvironment,
        BETTER_AUTH_URL: "https://admin.example.com",
        NODE_ENV: "production",
      },
      memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      [],
    );

    expect(productionOptions.advanced?.useSecureCookies).toBe(true);
    expect(productionOptions.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });

  it("rejects signup and user updates at the HTTP boundary", async () => {
    const directSignup = await harness.auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "Visitor",
          email: "visitor@example.test",
          password: invalidPassword,
        }),
      }),
    );
    const signup = await harness.routes.POST(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        body: "{}",
      }),
    );
    const updateUser = await harness.routes.POST(
      new Request("http://localhost:3000/api/auth/update-user", {
        method: "POST",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
    const socialLogin = await harness.routes.POST(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        body: JSON.stringify({ provider: "google" }),
      }),
    );

    expect(directSignup.status).toBe(400);
    expect(harness.database.user).toHaveLength(0);
    expect(signup.status).toBe(404);
    expect(updateUser.status).toBe(404);
    expect(socialLogin.status).toBe(404);
    expect(signup.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects invalid credentials with a generic response", async () => {
    const response = await harness.routes.POST(
      signInRequest("unknown@example.test", invalidPassword),
    );
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain("Email atau kata sandi tidak valid.");
    expect(body).not.toContain("unknown@example.test");
    expect(body).not.toContain(invalidPassword);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("allows a provisioned admin to sign in without exposing role or session tokens", async () => {
    await provisionUser(
      harness,
      "admin@example.test",
      adminPassword,
      "admin",
    );

    const wrongPassword = await harness.routes.POST(
      signInRequest("admin@example.test", invalidPassword),
    );
    const response = await harness.routes.POST(
      signInRequest("admin@example.test", adminPassword),
    );
    const body = await response.json();

    expect(wrongPassword.status).toBe(401);
    expect(await wrongPassword.json()).toEqual({
      message: "Email atau kata sandi tidak valid.",
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("denies provisioned non-admin users and keeps session responses minimal", async () => {
    await provisionUser(
      harness,
      "member@example.test",
      memberPassword,
      "none",
    );

    const rejectedLogin = await harness.routes.POST(
      signInRequest("member@example.test", memberPassword),
    );
    const invalidSession = await harness.routes.GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: "better-auth.session_token=invalid-token" },
      }),
    );
    const rejectedLoginBody = await rejectedLogin.text();

    expect(rejectedLogin.status).toBe(401);
    expect(rejectedLoginBody).toContain("Email atau kata sandi tidak valid.");
    expect(rejectedLoginBody).not.toContain("member@example.test");
    expect(await invalidSession.json()).toBeNull();
  });

  it("rejects expired sessions and logout invalidates a valid session", async () => {
    await provisionUser(
      harness,
      "admin@example.test",
      adminPassword,
      "admin",
    );

    const firstLogin = await harness.routes.POST(
      signInRequest("admin@example.test", adminPassword),
    );
    const expiredCookie = sessionCookie(firstLogin);
    for (const session of harness.database.session!) {
      session.expiresAt = new Date(Date.now() - 60_000);
    }

    const expiredSession = await harness.routes.GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: expiredCookie },
      }),
    );

    expect(await expiredSession.json()).toBeNull();

    const secondLogin = await harness.routes.POST(
      signInRequest("admin@example.test", adminPassword),
    );
    const cookie = sessionCookie(secondLogin);
    const sessionResponse = await harness.routes.GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: cookie },
      }),
    );
    const sessionBody = await sessionResponse.json();

    expect(sessionBody).toEqual({
      user: { id: expect.any(String), name: "Test User" },
    });
    expect(JSON.stringify(sessionBody)).not.toContain("token");
    expect(JSON.stringify(sessionBody)).not.toContain("role");

    const logout = await harness.routes.POST(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:3000",
        },
      }),
    );
    const afterLogout = await harness.routes.GET(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: cookie },
      }),
    );

    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    expect(await afterLogout.json()).toBeNull();
  });
});
