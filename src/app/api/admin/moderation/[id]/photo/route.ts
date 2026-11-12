import { z } from "zod";
import { getAdminAuthorization } from "@/lib/admin-auth";
import { downloadPhoto } from "@/lib/menfess-photo-service";

type Context = { params: Promise<{ id: string }> };
const securityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

export async function GET(request: Request, { params }: Context) {
  try {
    const access = await getAdminAuthorization(request.headers);
    if (access.kind !== "authorized") {
      return new Response(null, { status: access.kind === "unauthenticated" ? 401 : 403, headers: securityHeaders });
    }
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return new Response(null, { status: 404, headers: securityHeaders });
    }
    const photo = await downloadPhoto(id);
    if (!photo) return new Response(null, { status: 404, headers: securityHeaders });
    const extension = photo.contentType === "image/jpeg" ? "jpg" :
      photo.contentType === "image/png" ? "png" : "webp";
    const disposition = new URL(request.url).searchParams.has("download")
      ? "attachment" : "inline";
    return new Response(photo.bytes, {
      status: 200,
      headers: {
        ...securityHeaders,
        "Content-Type": photo.contentType,
        "Content-Disposition": `${disposition}; filename="menfess-photo.${extension}"`,
      },
    });
  } catch (error) {
    console.error("[photo-download] Request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response(null, { status: 503, headers: securityHeaders });
  }
}
