import { createAdminSessionHandler } from "@/lib/admin-authorization";
import { getAdminAuthorization } from "@/lib/admin-auth";

export const GET = createAdminSessionHandler(getAdminAuthorization);
