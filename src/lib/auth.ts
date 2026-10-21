import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { createAuthOptions } from "@/lib/auth-options";

export const auth = betterAuth(
  createAuthOptions(
    process.env,
    prismaAdapter(prisma, { provider: "postgresql" }),
  ),
);
