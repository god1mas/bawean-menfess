import "server-only";

import { getAdminAuthorization } from "@/lib/admin-auth";
import { createAdminModerationHandlers } from "@/lib/admin-moderation-api";
import { createAdminModerationRepository } from "@/lib/admin-moderation";
import { prisma } from "@/lib/prisma";

const repository = createAdminModerationRepository(prisma);

export const adminModerationHandlers = createAdminModerationHandlers({
  resolveAuthorization: getAdminAuthorization,
  repository,
  baseUrl: process.env.BETTER_AUTH_URL,
  nodeEnv: process.env.NODE_ENV,
});
