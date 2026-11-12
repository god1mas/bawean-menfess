import "server-only";

import { prisma } from "@/lib/prisma";
import type { PublicApiDependencies } from "@/lib/public-api/handlers";
import { createPublicMenfessRepository } from "@/lib/public-api/repository";
import { createRateLimitIdentifier } from "@/lib/public-api/security";
import { discardStagedPhoto, stagePhoto } from "@/lib/menfess-photo-service";
import type { PhotoSubmissionDependencies } from "@/lib/public-api/handlers";

const repository = createPublicMenfessRepository(prisma);

export const publicApiDependencies: PublicApiDependencies = {
  identifyClient: (request, scope) =>
    createRateLimitIdentifier(request, scope),
  consumeRateLimit: (scope, digest, keyVersion) =>
    repository.consumeRateLimit(scope, digest, keyVersion),
  listActiveCategories: () => repository.listActiveCategories(),
  submitMenfess: (categorySlug, message, idempotencyKey, photo) =>
    repository.submitMenfess(categorySlug, message, idempotencyKey, photo),
  findPublicStatus: (rawCredential) =>
    repository.findPublicStatus(rawCredential),
};

export const photoSubmissionDependencies: PhotoSubmissionDependencies = {
  ...publicApiDependencies,
  stagePhoto,
  discardStagedPhoto,
};
