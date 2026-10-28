import {
  APIError,
  type BetterAuthOptions,
  type BetterAuthRateLimitOptions,
} from "better-auth";
import { nextCookies } from "better-auth/next-js";

export type AuthEnvironment = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
  VERCEL_URL?: string;
};

function vercelDeploymentOrigin(value: string | undefined) {
  if (!value) return undefined;

  const hostname = value.trim().toLowerCase();
  const vercelHostname =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/;

  if (!vercelHostname.test(hostname)) {
    throw new Error("VERCEL_URL must be a valid Vercel deployment hostname.");
  }

  return `https://${hostname}`;
}

export function validateAuthEnvironment(environment: AuthEnvironment) {
  const secret = environment.BETTER_AUTH_SECRET;
  const url = environment.BETTER_AUTH_URL;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 bytes.");
  }

  if (!url) {
    throw new Error("BETTER_AUTH_URL is required.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid absolute URL.");
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("BETTER_AUTH_URL must contain only an HTTP(S) origin.");
  }

  if (environment.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }

  const baseURL = parsedUrl.origin;
  const deploymentOrigin = vercelDeploymentOrigin(environment.VERCEL_URL);

  return {
    secret,
    baseURL,
    trustedOrigins: [...new Set([baseURL, deploymentOrigin].filter(Boolean))] as string[],
  };
}

export function createAuthOptions(
  environment: AuthEnvironment,
  database: NonNullable<BetterAuthOptions["database"]>,
  plugins = [nextCookies()],
  rateLimit?: BetterAuthRateLimitOptions,
): BetterAuthOptions {
  const { secret, baseURL, trustedOrigins } =
    validateAuthEnvironment(environment);
  const secureCookies =
    environment.NODE_ENV === "production" || baseURL.startsWith("https://");

  return {
    appName: "Bawean Menfess",
    baseURL,
    secret,
    database,
    ...(rateLimit ? { rateLimit } : {}),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      modelName: "user",
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "none",
          input: false,
          returned: false,
        },
      },
    },
    session: {
      modelName: "session",
      cookieCache: { enabled: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(
              session.userId,
            );

            if (!user || !("role" in user) || user.role !== "admin") {
              throw APIError.fromStatus("UNAUTHORIZED", {
                message: "Invalid email or password.",
              });
            }
          },
        },
      },
    },
    account: { modelName: "account" },
    verification: { modelName: "verification" },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-vercel-forwarded-for"],
      },
      database: {
        generateId: "uuid",
      },
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
      },
    },
    plugins,
  };
}
