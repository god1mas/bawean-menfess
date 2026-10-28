import { toNextJsHandler } from "better-auth/next-js";

type AuthHandler = {
  handler: (request: Request) => Promise<Response>;
};

const allowedAuthPaths = {
  GET: new Set(["/api/auth/get-session"]),
  POST: new Set(["/api/auth/sign-in/email", "/api/auth/sign-out"]),
} as const;

function noStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function sanitizeResponse(
  response: Response,
  operation: "session" | "sign-in" | "sign-out",
) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  if (!response.ok) {
    const message =
      operation === "sign-in"
        ? "Email atau kata sandi tidak valid."
        : "Permintaan autentikasi tidak dapat diproses.";

    if (response.status === 429) {
      const retryAfter = response.headers.get("x-retry-after");
      if (retryAfter) headers.set("Retry-After", retryAfter);
    }

    return noStore(
      new Response(JSON.stringify({ message }), {
        status: response.status,
        headers,
      }),
    );
  }

  if (operation === "session") {
    const payload: unknown = await response.json();
    const user =
      payload && typeof payload === "object" && "user" in payload
        ? payload.user
        : null;

    const safeUser =
      user &&
      typeof user === "object" &&
      "id" in user &&
      typeof user.id === "string" &&
      "name" in user &&
      typeof user.name === "string"
        ? { id: user.id, name: user.name }
        : null;

    return noStore(
      new Response(
        JSON.stringify(safeUser ? { user: safeUser } : null),
        { status: response.status, headers },
      ),
    );
  }

  return noStore(
    new Response(JSON.stringify({ ok: true }), {
      status: response.status,
      headers,
    }),
  );
}

export function createAuthRouteHandlers(auth: AuthHandler) {
  const handlers = toNextJsHandler(auth);

  return {
    GET: async (request: Request) => {
      if (!allowedAuthPaths.GET.has(new URL(request.url).pathname)) {
        return noStore(Response.json({ message: "Not found." }, { status: 404 }));
      }

      return sanitizeResponse(await handlers.GET(request), "session");
    },
    POST: async (request: Request) => {
      const pathname = new URL(request.url).pathname;
      const operation =
        pathname === "/api/auth/sign-in/email"
          ? "sign-in"
          : pathname === "/api/auth/sign-out"
            ? "sign-out"
            : null;

      if (!operation || !allowedAuthPaths.POST.has(pathname)) {
        return noStore(Response.json({ message: "Not found." }, { status: 404 }));
      }

      return sanitizeResponse(
        await handlers.POST(request),
        operation,
      );
    },
  };
}
