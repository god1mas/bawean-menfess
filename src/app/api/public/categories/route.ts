import { createCategoriesHandler } from "@/lib/public-api/handlers";
import { publicApiDependencies } from "@/lib/public-api/production";

export const GET = createCategoriesHandler(publicApiDependencies);
