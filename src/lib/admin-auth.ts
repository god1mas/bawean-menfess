import "server-only";

import { auth } from "@/lib/auth";
import { createAdminAuthorizationResolver } from "@/lib/admin-authorization";
import { prisma } from "@/lib/prisma";

export const getAdminAuthorization = createAdminAuthorizationResolver({
  getSession: async (headers) => {
    const session = await auth.api.getSession({ headers });
    return session
      ? { user: { id: session.user.id, name: session.user.name } }
      : null;
  },
  findRole: async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role ?? null;
  },
});
