import "server-only";

import { prisma } from "@/lib/prisma";
import type { PublicApiDependencies } from "@/lib/public-api/handlers";
import { createPublicMenfessRepository } from "@/lib/public-api/repository";
import { createRateLimitIdentifier } from "@/lib/public-api/security";

const repository = createPublicMenfessRepository(prisma);

export const publicApiDependencies: PublicApiDependencies = {
  identifyClient: (request, scope) =>
    createRateLimitIdentifier(request, scope),
  consumeRateLimit: (scope, digest, keyVersion) =>
    repository.consumeRateLimit(scope, digest, keyVersion),
  listActiveCategories: () => repository.listActiveCategories(),
  submitMenfess: (categorySlug, message, idempotencyKey) =>
    repository.submitMenfess(categorySlug, message, idempotencyKey),
  findPublicStatus: (rawCredential) =>
    repository.findPublicStatus(rawCredential),
};
