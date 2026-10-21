import { createSubmissionHandler } from "@/lib/public-api/handlers";
import { publicApiDependencies } from "@/lib/public-api/production";

export const POST = createSubmissionHandler(publicApiDependencies);
