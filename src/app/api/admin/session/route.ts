import { connection } from "next/server";
import { createAdminSessionHandler } from "@/lib/admin-authorization";
import { getAdminAuthorization } from "@/lib/admin-auth";

const handleAdminSession = createAdminSessionHandler(getAdminAuthorization);

export async function GET(request: Request) {
  await connection();
  return handleAdminSession(request);
}
