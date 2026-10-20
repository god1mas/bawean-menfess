import { describe, expect, it } from "vitest";
import { siteConfig } from "../../src/config/site";

describe("siteConfig", () => {
  it("exposes the Bawean Menfess identity", () => {
    expect(siteConfig.name).toBe("Bawean Menfess");
    expect(siteConfig.description.length).toBeGreaterThan(20);
  });
});
