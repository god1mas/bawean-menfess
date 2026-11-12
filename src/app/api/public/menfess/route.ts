import { createPhotoSubmissionHandler, createSubmissionHandler } from "@/lib/public-api/handlers";
import { photoSubmissionDependencies, publicApiDependencies } from "@/lib/public-api/production";

const submitJson = createSubmissionHandler(publicApiDependencies);
const submitPhoto = createPhotoSubmissionHandler(photoSubmissionDependencies);

export function POST(request: Request) {
  return request.headers.get("content-type")?.startsWith("multipart/form-data")
    ? submitPhoto(request)
    : submitJson(request);
}
