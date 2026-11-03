import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  applyConfirmedModeration,
  applyOptimisticModeration,
  ModerationConfirmationDialog,
  ModerationDashboard,
  runModerationActionOnce,
  runOptimisticModerationRequest,
  type DashboardData,
  type Detail,
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

const detailFixture: Detail = {
  id: "11111111-1111-4111-8111-111111111111",
  message: "Pesan yang sedang ditinjau.",
  status: "PENDING",
  version: 0,
  submittedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  publishedAt: null,
  publicationReference: null,
  publicationRemoval: null,
  trackingCredentials: "Kredensial tidak tersedia.",
  category: { slug: "curhat", label: "Curhat" },
  moderationLogs: [],
};

const dashboardFixture: DashboardData = {
  stats: { total: 1, pending: 1, approved: 0, published: 0, rejected: 0 },
  categories: [{ slug: "curhat", label: "Curhat", isActive: true }],
  recentActivity: [],
  queue: {
    items: [detailFixture],
    total: 1,
    page: 1,
    pageSize: 20,
    pageCount: 1,
  },
};

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

  it("updates status and counts optimistically without claiming an audit success", () => {
    const optimistic = applyOptimisticModeration(
      dashboardFixture,
      detailFixture,
      {
        action: "APPROVE",
        activeStatus: "PENDING",
        timestamp: "2026-11-03T00:00:00.000Z",
      },
    );

    expect(optimistic.detail).toMatchObject({
      status: "APPROVED",
      version: 1,
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    expect(optimistic.data?.stats).toMatchObject({ pending: 0, approved: 1 });
    expect(optimistic.data?.queue).toMatchObject({
      items: [],
      total: 0,
      pageCount: 0,
    });
    expect(optimistic.data?.recentActivity).toEqual([]);
    expect(optimistic.detail.moderationLogs).toEqual([]);
  });

  it("adds server-confirmed audit data without changing optimistic counts twice", () => {
    const optimistic = applyOptimisticModeration(
      dashboardFixture,
      detailFixture,
      {
        action: "APPROVE",
        activeStatus: "PENDING",
        timestamp: "2026-11-03T00:00:00.000Z",
      },
    );
    const confirmed = applyConfirmedModeration(
      optimistic.data,
      optimistic.detail,
      {
        kind: "MODERATION",
        id: detailFixture.id,
        status: "APPROVED",
        version: 1,
        updatedAt: "2026-11-03T00:00:01.000Z",
        publishedAt: null,
        publicationReference: null,
        activity: {
          id: "22222222-2222-4222-8222-222222222222",
          action: "APPROVE",
          fromStatus: "PENDING",
          toStatus: "APPROVED",
          note: null,
          createdAt: "2026-11-03T00:00:01.000Z",
          menfessId: detailFixture.id,
          actor: { name: "Admin" },
        },
      },
    );

    expect(confirmed.data?.stats).toMatchObject({ pending: 0, approved: 1 });
    expect(confirmed.data?.recentActivity).toHaveLength(1);
    expect(confirmed.detail?.moderationLogs).toHaveLength(1);
    expect(confirmed.detail?.moderationLogs[0]).toMatchObject({
      action: "APPROVE",
      actor: { name: "Admin" },
    });
  });

  it("rolls optimistic state back when the server request fails", async () => {
    const state = { value: "PENDING" };
    const confirm = vi.fn();

    await expect(
      runOptimisticModerationRequest({
        apply: () => {
          state.value = "APPROVED";
        },
        request: async () => {
          throw new Error("Server unavailable");
        },
        confirm,
        rollback: () => {
          state.value = "PENDING";
        },
      }),
    ).rejects.toThrow("Server unavailable");

    expect(state.value).toBe("PENDING");
    expect(confirm).not.toHaveBeenCalled();
  });
});
