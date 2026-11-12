import "server-only";
import { after } from "next/server";

import { getAdminAuthorization } from "@/lib/admin-auth";
import { createAdminModerationHandlers } from "@/lib/admin-moderation-api";
import { createAdminModerationRepository } from "@/lib/admin-moderation";
import { prisma } from "@/lib/prisma";
import { cleanupPhotoForMenfess } from "@/lib/menfess-photo-service";

const repository = createAdminModerationRepository(prisma);

export const adminModerationHandlers = createAdminModerationHandlers({
  resolveAuthorization: getAdminAuthorization,
  repository,
  schedulePhotoCleanup: (id) => {
    after(async () => {
      try {
        await cleanupPhotoForMenfess(id);
      } catch (error) {
        console.error("[photo-cleanup] Deferred deletion failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    });
  },
  baseUrl: process.env.BETTER_AUTH_URL,
  nodeEnv: process.env.NODE_ENV,
});
