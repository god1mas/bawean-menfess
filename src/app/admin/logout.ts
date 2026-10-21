"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { auth } from "@/lib/auth";

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/admin/login" as Route);
}
