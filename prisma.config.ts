import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

const localEnvironmentPath = join(process.cwd(), ".env.local");

if (existsSync(localEnvironmentPath)) {
  process.loadEnvFile(localEnvironmentPath);
}

const directUrl = process.env.DIRECT_URL;

function withCertificateVerifiedTls(connectionString: string) {
  const caPath = join(
    process.cwd(),
    "certificates",
    "supabase-prod-ca-2021.crt",
  );

  if (!existsSync(caPath)) {
    throw new Error("The PostgreSQL CA certificate is missing.");
  }

  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", caPath.replaceAll("\\", "/"));

  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(directUrl
    ? {
        datasource: {
          url: withCertificateVerifiedTls(directUrl),
        },
      }
    : {}),
});
