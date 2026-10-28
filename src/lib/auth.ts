import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import {
  adminLoginRateLimit,
  createAdminLoginRateLimitStorage,
} from "@/lib/admin-login-rate-limit";
import { createAuthOptions } from "@/lib/auth-options";
import { createPublicMenfessRepository } from "@/lib/public-api/repository";

const publicRepository = createPublicMenfessRepository(prisma);
const loginRateLimitStorage = createAdminLoginRateLimitStorage({
  consumeRateLimit: (digest, keyVersion) =>
    publicRepository.consumeRateLimit("admin-login", digest, keyVersion),
});

export const auth = betterAuth(
  createAuthOptions(
    process.env,
    prismaAdapter(prisma, { provider: "postgresql" }),
    undefined,
    {
      enabled: true,
      customStorage: loginRateLimitStorage,
      customRules: {
        "/sign-in/email": adminLoginRateLimit,
        "*": false,
      },
    },
  ),
);
