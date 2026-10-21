import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { Route } from "next";
import { LogoutButton } from "@/app/admin/logout-button";
import { getAdminAuthorization } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Dashboard Admin",
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-svh bg-bm-admin-shell" />}>
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  await connection();
  const authorization = await getAdminAuthorization(await headers());

  if (authorization.kind !== "authorized") {
    redirect("/admin/login" as Route);
  }

  return (
    <main className="min-h-svh bg-bm-admin-shell px-6 py-10">
      <section className="mx-auto flex max-w-5xl items-center justify-between rounded-3xl border border-bm-border bg-white p-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-bm-gold">
            Bawean Menfess
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-bm-brand">
            Dashboard Admin
          </h1>
          <p className="mt-2 text-sm text-bm-muted">
            Sesi aktif untuk {authorization.user.name}.
          </p>
        </div>
        <LogoutButton />
      </section>
    </main>
  );
}
