import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicFooter } from "../../src/components/public/public-footer";
import { SubmitForm } from "../../src/components/public/submit-form";

describe("rules and privacy journey", () => {
  it("links both policy routes from the footer and submission consent", () => {
    const footer = renderToStaticMarkup(createElement(PublicFooter));
    const form = renderToStaticMarkup(createElement(SubmitForm));

    expect(footer).toContain('href="/aturan"');
    expect(footer).toContain('href="/privasi"');
    expect(form).toContain('href="/aturan"');
    expect(form).toContain('href="/privasi"');
  });

  it("states approved policy targets without inventing legal or provider verification", () => {
    const rules = readFileSync("src/app/aturan/page.tsx", "utf8");
    const privacy = readFileSync("src/app/privasi/page.tsx", "utf8");
    const decisions = readFileSync("docs/POLICY_DECISIONS.md", "utf8");

    expect(rules).toContain("dimasabdussyukur@gmail.com");
    expect(rules).toContain("tidak menjamin persetujuan atau publikasi");
    expect(privacy).toContain("bukan pernyataan bahwa identitas operator hukum");
    expect(privacy).toContain("Konfigurasi dan masa simpan cadangan proyek masih");
    expect(decisions).toContain("Owner-approved decisions");
    expect(decisions).toContain("Assign a backup incident owner");
  });
});
