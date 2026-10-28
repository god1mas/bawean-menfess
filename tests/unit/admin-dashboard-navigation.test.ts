import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ModerationConfirmationDialog,
  ModerationDashboard,
  runModerationActionOnce,
} from "../../src/components/admin/moderation-dashboard";

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

  it("shows separate approved and published lifecycle totals", () => {
    expect(dashboardMarkup).toContain("Disetujui, belum tayang");
    expect(dashboardMarkup).toContain("Dipublikasikan");
    expect(dashboardMarkup).not.toContain("Disetujui / tayang");
  });

  it.each([
    ["APPROVE", "Setujui menfess ini?", "Ya, setujui"],
    ["REJECT", "Tolak menfess ini?", "Ya, tolak"],
    ["PUBLISH", "Tandai sebagai dipublikasikan?", "Ya, tandai tayang"],
    ["REMOVE_PUBLICATION", "Catat penghapusan publikasi?", "Ya, catat penghapusan"],
  ] as const)("renders an accessible %s confirmation", (action, title, label) => {
    const markup = renderToStaticMarkup(
      createElement(ModerationConfirmationDialog, {
        action,
        acting: false,
        detail: {
          id: "11111111-1111-4111-8111-111111111111",
          message: "Pesan yang sedang ditinjau.",
          status: action === "PUBLISH" ? "APPROVED" : action === "REMOVE_PUBLICATION" ? "PUBLISHED" : "PENDING",
          version: 0,
          submittedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          publishedAt: null,
          publicationReference: null,
          publicationRemoval: null,
          trackingCredentials: "Kredensial tidak tersedia.",
          category: { slug: "curhat", label: "Curhat" },
          moderationLogs: [],
        },
        publicationReference: "",
        reason: "Alasan audit.",
        onCancel: () => undefined,
        onConfirm: () => undefined,
        onPublicationReferenceChange: () => undefined,
      }),
    );

    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-labelledby="moderation-confirmation-title"');
    expect(markup).toContain(title);
    expect(markup).toContain(label);
    expect(markup).toContain("Pesan yang sedang ditinjau.");
    expect(markup).toContain('type="button"');
  });

  it("allows only one confirmation request while an action is in flight", async () => {
    const lock = { current: false };
    let resolveAction: ((value: boolean) => void) | undefined;
    const perform = vi.fn(
      async () =>
        new Promise<boolean>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const first = runModerationActionOnce(lock, "APPROVE", perform);
    const duplicate = await runModerationActionOnce(lock, "APPROVE", perform);

    expect(duplicate).toBe(false);
    expect(perform).toHaveBeenCalledOnce();
    resolveAction?.(true);
    await expect(first).resolves.toBe(true);
    expect(lock.current).toBe(false);
  });
});
