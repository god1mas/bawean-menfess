"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "@/app/admin/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
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
      {state.error ? (
        <p aria-live="polite" className="text-sm text-red-700" role="alert">
          {state.error}
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
