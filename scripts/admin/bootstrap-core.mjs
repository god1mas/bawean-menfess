import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

export class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = "BootstrapError";
    this.code = code;
  }
}

export function validateBootstrapInput(input) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!name || name.length > 120) {
    throw new BootstrapError("INVALID_NAME");
  }
  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new BootstrapError("INVALID_EMAIL");
  }
  if ([...password].length < 12 || [...password].length > 128) {
    throw new BootstrapError("INVALID_PASSWORD");
  }

  return { name, email, password };
}

export async function bootstrapFirstAdmin(client, untrustedInput) {
  const input = validateBootstrapInput(untrustedInput);
  await client.query("BEGIN");

  try {
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1, $2)", [
      20261023,
      611,
    ]);
    const existing = await client.query(
      `SELECT 1
       FROM app_private.auth_user
       WHERE role = 'admin'
       LIMIT 1`,
    );

    if (existing.rowCount) {
      throw new BootstrapError("ADMIN_ALREADY_EXISTS");
    }

    const userId = randomUUID();
    const accountId = randomUUID();
    const passwordHash = await hashPassword(input.password);

    await client.query(
      `INSERT INTO app_private.auth_user
         (id, name, email, email_verified, created_at, updated_at, role)
       VALUES ($1, $2, $3, TRUE, clock_timestamp(), clock_timestamp(), 'admin')`,
      [userId, input.name, input.email],
    );
    await client.query(
      `INSERT INTO app_private.auth_account
         (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, 'credential', $3, $4, clock_timestamp(), clock_timestamp())`,
      [accountId, userId, userId, passwordHash],
    );
    await client.query("COMMIT");

    return { id: userId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
