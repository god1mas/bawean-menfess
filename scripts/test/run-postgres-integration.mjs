import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const containerName = `bawean-menfess-postgres-test-${process.pid}`;
const databaseName = "bawean_d1_test";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    env: options.env ?? process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }

  return result.stdout?.trim() ?? "";
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

async function provision(port) {
  const admin = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: "postgres",
  });
  await admin.connect();
  await admin.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE ROLE bawean_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  `);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  await admin.end();

  const owner = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: databaseName,
  });
  await owner.connect();
  await owner.query(
    readFileSync(
      "prisma/migrations/20261021130000_initial_schema/migration.sql",
      "utf8",
    ),
  );
  await owner.query(`
    CREATE TABLE public._prisma_migrations (
      id varchar(36) PRIMARY KEY,
      checksum varchar(64) NOT NULL,
      finished_at timestamptz,
      migration_name varchar(255) NOT NULL,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0
    );
    GRANT ALL ON TABLE public._prisma_migrations
      TO anon, authenticated, service_role, bawean_app;
  `);
  await owner.query(
    readFileSync(
      "prisma/migrations/20261022130000_add_postgres_rate_limiting/migration.sql",
      "utf8",
    ),
  );
  await owner.query(`
    INSERT INTO app_private.category (slug, label, sort_order, updated_at)
    VALUES
      ('confess', 'Confess', 1, clock_timestamp()),
      ('curhat', 'Curhat', 2, clock_timestamp()),
      ('ask-bm', 'Ask BM', 3, clock_timestamp()),
      ('connect', 'Connect', 4, clock_timestamp()),
      ('discuss', 'Discuss', 5, clock_timestamp());
  `);
  await owner.end();
}

async function main() {
  let started = false;

  try {
    run("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--publish",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ]);
    started = true;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync(
        "docker",
        ["exec", containerName, "pg_isready", "-U", "postgres"],
        { stdio: "ignore" },
      );
      if (ready.status === 0) break;
      if (attempt === 59) throw new Error("PostgreSQL 17 did not become ready.");
      wait(500);
    }

    const mapping = run("docker", ["port", containerName, "5432/tcp"]);
    const port = Number.parseInt(mapping.split(":").at(-1), 10);
    if (!Number.isInteger(port)) throw new Error("Docker did not return a port.");

    await provision(port);

    const ownerUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
    const runtimeUrl = `postgresql://bawean_app@127.0.0.1:${port}/${databaseName}`;
    const childEnvironment = {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      POSTGRES_TEST_OWNER_URL: ownerUrl,
      TRACKING_CODE_HMAC_KEY_V1: randomBytes(32).toString("base64url"),
      TRACKING_URL_HMAC_KEY_V1: randomBytes(32).toString("base64url"),
      RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1: randomBytes(32).toString("base64url"),
    };

    run(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.postgres.config.mts",
      ],
      { inherit: true, env: childEnvironment },
    );
  } finally {
    if (started) {
      spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Integration test failed.");
  process.exitCode = 1;
});
