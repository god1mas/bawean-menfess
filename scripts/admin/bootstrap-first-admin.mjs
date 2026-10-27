import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import pg from "pg";
import { bootstrapFirstAdmin } from "./bootstrap-core.mjs";

const { Client } = pg;
const projectReference = "hqupjaaagwpafeuwyixe";
const caPath = join(process.cwd(), "certificates", "supabase-prod-ca-2021.crt");

function targetConfiguration() {
  if (existsSync(join(process.cwd(), ".env.local"))) {
    process.loadEnvFile(join(process.cwd(), ".env.local"));
  }
  const value = process.env.DIRECT_URL;
  if (!value) throw new Error("MISSING_DIRECT_URL");

  const url = new URL(value);
  const role = decodeURIComponent(url.username);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );
  const direct = url.hostname === `db.${projectReference}.supabase.co`;
  const pooler =
    url.hostname === "aws-0-ap-southeast-1.pooler.supabase.com";
  const remoteRoleIsApproved =
    (direct && role === "postgres") ||
    (pooler && role === `postgres.${projectReference}`);

  if (
    url.pathname !== "/postgres" ||
    (local && role !== "postgres") ||
    (!local && !(direct || pooler)) ||
    ((direct || pooler) && !remoteRoleIsApproved)
  ) {
    throw new Error("UNAPPROVED_TARGET");
  }

  for (const key of [
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslaccept",
  ]) {
    url.searchParams.delete(key);
  }

  return {
    url,
    ssl: local
      ? false
      : {
          ca: readFileSync(caPath, "utf8"),
          rejectUnauthorized: true,
        },
  };
}

async function promptHiddenPassword(question) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("INTERACTIVE_TERMINAL_REQUIRED");
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new StringDecoder("utf8");
    const onData = (chunk) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("CANCELLED"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
        } else if (character >= " " && character !== "\u007f") {
          value += character;
        }
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("INTERACTIVE_TERMINAL_REQUIRED");
  }

  const target = targetConfiguration();
  const client = new Client({
    connectionString: target.url.toString(),
    ssl: target.ssl,
    application_name: "bawean-admin-bootstrap",
    connectionTimeoutMillis: 15_000,
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const identity = (
      await client.query(
        "SELECT current_database() AS database_name, current_user AS role_name",
      )
    ).rows[0];
    if (identity?.database_name !== "postgres" || !identity.role_name.startsWith("postgres")) {
      throw new Error("DATABASE_IDENTITY_MISMATCH");
    }

    stdout.write(
      `Target: ${target.url.hostname} / ${identity.database_name} (${identity.role_name})\n`,
    );
    const confirmation = await linePrompt(
      "Type CREATE FIRST ADMIN to continue: ",
    );
    if (confirmation !== "CREATE FIRST ADMIN") {
      throw new Error("CONFIRMATION_NOT_MATCHED");
    }

    const name = await linePrompt("Administrator name: ");
    const email = await linePrompt("Administrator email: ");
    const password = await promptHiddenPassword("Password (hidden): ");
    const repeatedPassword = await promptHiddenPassword("Repeat password (hidden): ");
    if (password !== repeatedPassword) {
      throw new Error("PASSWORDS_DO_NOT_MATCH");
    }

    await bootstrapFirstAdmin(client, { name, email, password });
    stdout.write("First administrator created. No password was displayed.\n");
  } finally {
    if (connected) await client.end();
  }
}

async function linePrompt(question) {
  const interfaceHandle = createInterface({ input: stdin, output: stdout });
  try {
    return (await interfaceHandle.question(question)).trim();
  } finally {
    interfaceHandle.close();
  }
}

main().catch((error) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : error instanceof Error
        ? error.message
        : "UNKNOWN";
  const message =
    code === "ADMIN_ALREADY_EXISTS"
      ? "Bootstrap refused: an administrator already exists."
      : code === "INVALID_EMAIL"
        ? "Bootstrap refused: enter a valid email address."
        : code === "INVALID_NAME"
          ? "Bootstrap refused: enter a name of at most 120 characters."
          : code === "INVALID_PASSWORD"
            ? "Bootstrap refused: use a password of 12–128 characters."
            : code === "PASSWORDS_DO_NOT_MATCH"
              ? "Bootstrap refused: the passwords did not match."
              : code === "CONFIRMATION_NOT_MATCHED"
                ? "Bootstrap cancelled."
                : code === "INTERACTIVE_TERMINAL_REQUIRED"
                  ? "Bootstrap requires an interactive terminal."
                  : "Bootstrap failed safely. Check the approved target and secure database connectivity.";
  stdout.write(`${message}\n`);
  process.exitCode = 1;
});
