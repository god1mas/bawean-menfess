import { describe, expect, it, vi } from "vitest";
import {
  createAdminAuthorizationResolver,
  createAdminSessionHandler,
} from "../../src/lib/admin-authorization";

describe("admin authorization", () => {
  it("returns 401 when there is no valid session", async () => {
    const findRole = vi.fn(async () => "admin");
    const resolve = createAdminAuthorizationResolver({
      getSession: async () => null,
      findRole,
    });
    const handler = createAdminSessionHandler(resolve);
    const response = await handler(new Request("http://localhost/api/admin/session"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(findRole).not.toHaveBeenCalled();
  });

  it("returns 403 when the database role is not admin, regardless of session data", async () => {
    const resolve = createAdminAuthorizationResolver({
      getSession: async () => ({
        user: { id: "user-1", name: "Member", role: "admin" },
      }),
      findRole: async () => "none",
    });
    const handler = createAdminSessionHandler(resolve);
    const response = await handler(new Request("http://localhost/api/admin/session"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden." });
  });

  it("returns only the authorized user's safe identity after a fresh role lookup", async () => {
    const findRole = vi.fn(async () => "admin");
    const resolve = createAdminAuthorizationResolver({
      getSession: async () => ({
        user: { id: "user-1", name: "Admin" },
      }),
      findRole,
    });
    const handler = createAdminSessionHandler(resolve);
    const response = await handler(new Request("http://localhost/api/admin/session"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: "user-1", name: "Admin" },
    });
    expect(findRole).toHaveBeenCalledWith("user-1");
  });
});
