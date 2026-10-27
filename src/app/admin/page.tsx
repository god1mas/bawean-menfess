import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { LogoutButton } from "@/app/admin/logout-button";
import { ModerationDashboard } from "@/components/admin/moderation-dashboard";
import { getAdminAuthorization } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Moderasi — Bawean Menfess",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-svh place-items-center bg-bm-admin-shell">
          <p className="text-sm font-semibold text-bm-muted" role="status">
            Memuat ruang moderasi…
          </p>
        </main>
      }
    >
      <AuthorizedAdminDashboard />
    </Suspense>
  );
}

async function AuthorizedAdminDashboard() {
  const authorization = await getAdminAuthorization(await headers());

  if (authorization.kind !== "authorized") {
    redirect("/admin/login");
  }

  return (
    <main className="min-h-svh bg-bm-admin-shell">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-bm-brand text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="rounded-2xl bg-white px-3 py-2">
            <BrandLockup compact />
          </div>
        </div>
        <nav aria-label="Navigasi admin" className="space-y-2 px-4 py-7">
          <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-bm-gold">
            Panel admin
          </p>
          <a
            href="#dashboard-summary"
            className="block rounded-xl px-3 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Ringkasan
          </a>
          <a
            href="#moderation-queue"
            aria-current="location"
            className="block rounded-xl bg-white/15 px-3 py-3 text-sm font-bold text-white ring-1 ring-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Moderasi menfess
          </a>
          <a
            href="#recent-activity"
            className="block rounded-xl px-3 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Aktivitas terbaru
          </a>
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-bm-border bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-4 md:px-10">
            <div className="lg:hidden">
              <BrandLockup compact />
            </div>
            <p className="hidden text-sm font-bold text-bm-brand lg:block">
              Moderasi menfess
            </p>
            <div className="flex items-center gap-4">
              <p className="hidden text-sm text-bm-muted sm:block">
                Masuk sebagai{" "}
                <span className="font-bold text-bm-brand">{authorization.user.name}</span>
              </p>
              <LogoutButton />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-4 py-7 md:px-10 md:py-10">
          <ModerationDashboard />
        </div>
      </div>
    </main>
  );
}
