export type AdminAuthorization =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "authorized"; user: { id: string; name: string } };

export type AdminAuthorizationDependencies = {
  getSession: (
    headers: Headers,
  ) => Promise<{ user: { id: string; name: string } } | null>;
  findRole: (userId: string) => Promise<string | null>;
};

export function createAdminAuthorizationResolver(
  dependencies: AdminAuthorizationDependencies,
) {
  return async (headers: Headers): Promise<AdminAuthorization> => {
    const session = await dependencies.getSession(headers);

    if (!session) {
      return { kind: "unauthenticated" };
    }

    const role = await dependencies.findRole(session.user.id);

    if (role !== "admin") {
      return { kind: "forbidden" };
    }

    return {
      kind: "authorized",
      user: { id: session.user.id, name: session.user.name },
    };
  };
}

export function createAdminSessionHandler(
  resolveAuthorization: (
    headers: Headers,
  ) => Promise<AdminAuthorization>,
) {
  return async (request: Request) => {
    const authorization = await resolveAuthorization(request.headers);
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Vary: "Cookie",
    });

    if (authorization.kind === "unauthenticated") {
      return Response.json({ error: "Unauthorized." }, { status: 401, headers });
    }

    if (authorization.kind === "forbidden") {
      return Response.json({ error: "Forbidden." }, { status: 403, headers });
    }

    return Response.json(
      { user: authorization.user },
      { status: 200, headers },
    );
  };
}
