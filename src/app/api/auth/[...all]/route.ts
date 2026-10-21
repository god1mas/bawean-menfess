import { auth } from "@/lib/auth";
import { createAuthRouteHandlers } from "@/lib/auth-route";

export const { GET, POST } = createAuthRouteHandlers(auth);
