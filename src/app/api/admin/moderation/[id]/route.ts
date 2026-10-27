import { connection } from "next/server";
import { adminModerationHandlers } from "@/lib/admin-moderation-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  await connection();
  const { id } = await params;
  return adminModerationHandlers.detail(request, id);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return adminModerationHandlers.action(request, id);
}
