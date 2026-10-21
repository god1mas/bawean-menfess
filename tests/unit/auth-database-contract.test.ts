import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const privileges = readFileSync(
  resolve(process.cwd(), "docs/RUNTIME_DATABASE_ROLE.md"),
  "utf8",
);

describe("Better Auth database contract", () => {
  it("maps Better Auth models to the deployed app_private tables", () => {
    for (const [model, table] of [
      ["User", "auth_user"],
      ["Session", "auth_session"],
      ["Account", "auth_account"],
      ["Verification", "auth_verification"],
    ]) {
      expect(schema).toMatch(
        new RegExp(`model ${model} \\{[\\s\\S]*?@@map\\("${table}"\\)`),
      );
    }

    expect(schema).toContain('@@schema("app_private")');
    expect(schema).toMatch(
      /role\s+String\s+@default\("none"\)\s+@db\.VarChar\(32\)/,
    );
  });

  it("documents the least-privilege boundary used by admin-only sign-in", () => {
    expect(privileges).toMatch(/auth_user[^.\n]*(?:SELECT|select)/);
    expect(privileges).toMatch(/auth_session/i);
    expect(privileges).toMatch(/auth_account/i);
    expect(privileges).toMatch(/INSERT[^.\n]*auth_user|auth_user[^.\n]*INSERT/i);
    expect(privileges).toMatch(/role[^.\n]*(?:UPDATE|update)/i);
  });
});
