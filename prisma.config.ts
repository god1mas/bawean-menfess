import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

const localEnvironmentPath = join(process.cwd(), ".env.local");

if (existsSync(localEnvironmentPath)) {
  process.loadEnvFile(localEnvironmentPath);
}

const directUrl = process.env.DIRECT_URL;

function withCertificateVerifiedTls(connectionString: string) {
  const caPath = join(process.cwd(), "certificates", "supabase-prod-ca-2021.crt");

  if (!existsSync(caPath)) {
    throw new Error("The PostgreSQL CA certificate is missing.");
  }

  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("sslcert", "certificates/supabase-prod-ca-2021.crt");
  url.searchParams.set("connect_timeout", "30");
  url.searchParams.delete("sslrootcert");

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
