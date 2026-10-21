import type { Metadata } from "next";
import { LoginForm } from "@/app/admin/login/login-form";

export const metadata: Metadata = {
  title: "Masuk Admin",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-bm-border bg-white p-8 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wider text-bm-gold">
          Bawean Menfess
        </p>
        <h1 className="mt-3 text-2xl font-extrabold text-bm-brand">
          Masuk Admin
        </h1>
        <p className="mb-7 mt-2 text-sm leading-6 text-bm-muted">
          Akses hanya untuk administrator yang telah diprovisikan.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
