import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { createAuthRouteHandlers } from "@/lib/auth-route";

const handlers = createAuthRouteHandlers(auth);

export async function GET(request: Request) {
  await connection();
  return handlers.GET(request);
}

export const POST = handlers.POST;
