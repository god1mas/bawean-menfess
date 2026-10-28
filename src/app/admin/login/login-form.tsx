"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientRequestError, requestJson } from "@/lib/client-json";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    const genericError = "Email atau kata sandi tidak valid.";

    if (typeof email !== "string" || typeof password !== "string") {
      setError(genericError);
      return;
    }

    setPending(true);
    setError(undefined);

    try {
      await requestJson<{ ok: true }>(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        },
        {
          fallbackMessage: genericError,
          timeoutMessage: "Proses masuk terlalu lama. Coba lagi.",
        },
      );
      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof ClientRequestError && reason.status === 429
          ? "Terlalu banyak percobaan masuk. Coba lagi setelah 15 menit."
          : reason instanceof Error
            ? reason.message
            : genericError,
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold text-bm-text">
        Email
        <input
          autoComplete="username"
          className="rounded-xl border border-bm-border bg-white px-4 py-3"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-bm-text">
        Kata sandi
        <input
          autoComplete="current-password"
          className="rounded-xl border border-bm-border bg-white px-4 py-3"
          name="password"
          required
          type="password"
        />
      </label>
      {error ? (
        <p aria-live="polite" className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="rounded-xl bg-bm-brand px-4 py-3 font-bold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}
