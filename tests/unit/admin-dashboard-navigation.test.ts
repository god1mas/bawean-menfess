import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModerationDashboard } from "../../src/components/admin/moderation-dashboard";

const navigationTargets = [
  "dashboard-summary",
  "moderation-queue",
  "recent-activity",
] as const;

function sectionMarkup(html: string, id: string) {
  const match = html.match(
    new RegExp(`<section(?=[^>]*id="${id}")[^>]*>[\\s\\S]*?</section>`),
  );

  expect(match, `Expected section #${id} to render.`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("administrator dashboard anchor navigation", () => {
  const pageSource = readFileSync("src/app/admin/page.tsx", "utf8");
  const dashboardMarkup = renderToStaticMarkup(
    createElement(ModerationDashboard),
  );

  it("maps each sidebar anchor to one unique dashboard target", () => {
    const sidebarTargets = Array.from(
      pageSource.matchAll(/href="#([^"]+)"/gu),
      (match) => match[1],
    );
    const renderedTargets = Array.from(
      dashboardMarkup.matchAll(/\sid="([^"]+)"/gu),
      (match) => match[1],
    ).filter((id) => navigationTargets.includes(id as (typeof navigationTargets)[number]));

    expect(sidebarTargets).toEqual(navigationTargets);
    expect(renderedTargets).toEqual(navigationTargets);
    expect(new Set(renderedTargets).size).toBe(navigationTargets.length);
  });

  it("places every target on its intended section with a sticky-header offset", () => {
    const summary = sectionMarkup(dashboardMarkup, "dashboard-summary");
    const queue = sectionMarkup(dashboardMarkup, "moderation-queue");
    const activity = sectionMarkup(dashboardMarkup, "recent-activity");

    expect(summary).toContain("Total kiriman");
    expect(queue).toContain("Antrean moderasi");
    expect(activity).toContain("Aktivitas terbaru");
    expect(activity).not.toContain("Detail kiriman");

    for (const section of [summary, queue, activity]) {
      expect(section.match(/^<section[^>]*>/u)?.[0]).toContain("scroll-mt-24");
    }
  });
});
