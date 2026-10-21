import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const TLS_QUERY_PARAMETERS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
] as const;

function requiredEnvironmentVariable(name: "DATABASE_URL") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required on the server.`);
  }

  return value;
}

function createPrismaClient() {
  const connectionUrl = new URL(requiredEnvironmentVariable("DATABASE_URL"));

  for (const parameter of TLS_QUERY_PARAMETERS) {
    connectionUrl.searchParams.delete(parameter);
  }

  const caPath = join(
    process.cwd(),
    "certificates",
    "supabase-prod-ca-2021.crt",
  );

  const adapter = new PrismaPg(
    {
      connectionString: connectionUrl.toString(),
      connectionTimeoutMillis: 10_000,
      max: 1,
      ssl: {
        ca: readFileSync(caPath, "utf8"),
        rejectUnauthorized: true,
      },
    },
    { schema: "app_private" },
  );

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & {
  baweanPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.baweanPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.baweanPrisma = prisma;
}
