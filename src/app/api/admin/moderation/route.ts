import { connection } from "next/server";
import { adminModerationHandlers } from "@/lib/admin-moderation-service";

export async function GET(request: Request) {
  await connection();
  return adminModerationHandlers.list(request);
}
