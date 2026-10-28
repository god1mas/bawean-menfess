import "server-only";

import type { BetterAuthRateLimitStorage } from "better-auth";
import type { RateLimitDecision } from "@/lib/public-api/contracts";
import {
  createRateLimitKeyDigest,
  type D2Environment,
} from "@/lib/public-api/security";

export const adminLoginRateLimit = {
  max: 5,
  window: 15 * 60,
} as const;

type AdminLoginRateLimitDependencies = {
  consumeRateLimit: (
    digest: Buffer,
    keyVersion: number,
  ) => Promise<RateLimitDecision>;
  environment?: D2Environment;
};

export function createAdminLoginRateLimitStorage(
  dependencies: AdminLoginRateLimitDependencies,
): BetterAuthRateLimitStorage {
  return {
    async consume(key, rule) {
      if (
        rule.max !== adminLoginRateLimit.max ||
        rule.window !== adminLoginRateLimit.window
      ) {
        throw new Error("Unexpected administrator login rate-limit rule.");
      }

      const identity = createRateLimitKeyDigest(
        key,
        "admin-login",
        dependencies.environment,
      );
      const decision = await dependencies.consumeRateLimit(
        identity.digest,
        identity.keyVersion,
      );

      return {
        allowed: decision.allowed,
        retryAfter: decision.allowed ? null : decision.retryAfterSeconds,
      };
    },
  };
}
