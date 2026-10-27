import { describe, expect, it, vi } from "vitest";
import {
  bootstrapFirstAdmin,
  validateBootstrapInput,
} from "../../scripts/admin/bootstrap-core.mjs";

describe("first administrator bootstrap validation", () => {
  it("normalizes the administrator email and trims the display name", () => {
    expect(
      validateBootstrapInput({
        name: "  Site Administrator  ",
        email: "  Admin@Example.test ",
        password: "a-safe-password-123",
      }),
    ).toEqual({
      name: "Site Administrator",
      email: "admin@example.test",
      password: "a-safe-password-123",
    });
  });

  it("rejects weak, malformed, and oversized credentials before database access", () => {
    for (const input of [
      { name: "", email: "admin@example.test", password: "a-safe-password-123" },
      { name: "Admin", email: "not-an-email", password: "a-safe-password-123" },
      { name: "Admin", email: "admin@example.test", password: "short" },
      { name: "Admin", email: "admin@example.test", password: "x".repeat(129) },
    ]) {
      expect(() => validateBootstrapInput(input)).toThrow();
    }
  });

  it("does not begin a database transaction when input validation fails", async () => {
    const client: Parameters<typeof bootstrapFirstAdmin>[0] = {
      query: vi.fn(async () => ({ rowCount: 0 })),
    };
    await expect(
      bootstrapFirstAdmin(client, {
        name: "Admin",
        email: "admin@example.test",
        password: "short",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    expect(client.query).not.toHaveBeenCalled();
  });
});
