"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { auth } from "@/lib/auth";

export type LoginState = { error?: string };

const genericLoginError = "Email atau kata sandi tidak valid.";

export async function signInAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return { error: genericLoginError };
  }

  try {
    await auth.api.signInEmail({
      headers: await headers(),
      body: { email: email.trim(), password },
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: genericLoginError };
    }

    throw error;
  }

  redirect("/admin" as Route);
}
