import { createHash, timingSafeEqual } from "node:crypto";
import { reconcilePhotos } from "@/lib/menfess-photo-service";

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !header?.startsWith("Bearer ")) {
    return false;
  }
  const expected = createHash("sha256").update(secret).digest();
  const supplied = createHash("sha256").update(header.slice(7)).digest();
  return timingSafeEqual(expected, supplied);
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!authorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401, headers });
  }
  try {
    const result = await reconcilePhotos();
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch (error) {
    console.error("[photo-cleanup] Reconciliation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Cleanup unavailable." }, { status: 503, headers });
  }
}
