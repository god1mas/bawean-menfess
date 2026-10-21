-- PROPOSAL ONLY: do not apply without the explicit D2 PostgreSQL migration
-- approval required by docs/D2_RATE_LIMITING.md.
-- Prisma Migrate does not wrap PostgreSQL migration files automatically.
BEGIN;

-- D2.1 audit correction: Supabase public-schema default privileges granted
-- anon/authenticated/service_role full access to Prisma's migration history.
-- Prisma continues to use the postgres owner through DIRECT_URL.
REVOKE ALL ON TABLE "public"."_prisma_migrations"
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Internal fixed-window counters. The client identifier is an HMAC-SHA-256
-- digest produced by the server; plaintext IP addresses are never stored.
CREATE TABLE "app_private"."rate_limit_bucket" (
    "scope" VARCHAR(16) NOT NULL,
    "identifier_key_version" SMALLINT NOT NULL,
    "identifier_digest" BYTEA NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "request_count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY (
        "scope",
        "identifier_key_version",
        "identifier_digest",
        "window_started_at"
    ),
    CONSTRAINT "rate_limit_bucket_scope_check"
        CHECK ("scope" IN ('submission', 'tracking')),
    CONSTRAINT "rate_limit_bucket_identifier_key_version_check"
        CHECK ("identifier_key_version" > 0),
    CONSTRAINT "rate_limit_bucket_identifier_digest_length_check"
        CHECK (octet_length("identifier_digest") = 32),
    CONSTRAINT "rate_limit_bucket_request_count_check"
        CHECK ("request_count" > 0),
    CONSTRAINT "rate_limit_bucket_expiration_check"
        CHECK ("expires_at" > "window_started_at")
);

CREATE INDEX "rate_limit_bucket_expires_at_idx"
ON "app_private"."rate_limit_bucket" ("expires_at");

-- Defense in depth: the table is private and has no policies. Its owner-only
-- function is the sole application entry point.
ALTER TABLE "app_private"."rate_limit_bucket" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "app_private"."consume_rate_limit"(
    "p_scope" TEXT,
    "p_identifier_digest" BYTEA,
    "p_identifier_key_version" SMALLINT
)
RETURNS TABLE (
    "allowed" BOOLEAN,
    "remaining" INTEGER,
    "retry_after_seconds" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    "v_now" TIMESTAMPTZ(6) := clock_timestamp();
    "v_limit" INTEGER;
    "v_window_seconds" INTEGER;
    "v_window_started_at" TIMESTAMPTZ(6);
    "v_expires_at" TIMESTAMPTZ(6);
    "v_request_count" INTEGER;
BEGIN
    IF "p_identifier_digest" IS NULL
       OR octet_length("p_identifier_digest") <> 32 THEN
        RAISE EXCEPTION 'invalid rate-limit identifier digest'
            USING ERRCODE = '22023';
    END IF;

    IF "p_identifier_key_version" IS NULL
       OR "p_identifier_key_version" <= 0 THEN
        RAISE EXCEPTION 'invalid rate-limit identifier key version'
            USING ERRCODE = '22023';
    END IF;

    CASE "p_scope"
        WHEN 'submission' THEN
            "v_limit" := 5;
            "v_window_seconds" := 3600;
        WHEN 'tracking' THEN
            "v_limit" := 30;
            "v_window_seconds" := 600;
        ELSE
            RAISE EXCEPTION 'invalid rate-limit scope'
                USING ERRCODE = '22023';
    END CASE;

    "v_window_started_at" := date_bin(
        make_interval(secs => "v_window_seconds"),
        "v_now",
        TIMESTAMPTZ '1970-01-01 00:00:00+00'
    );
    "v_expires_at" := "v_window_started_at"
        + make_interval(secs => "v_window_seconds");

    -- Opportunistic bounded cleanup limits per-call work but does not impose
    -- a strict storage bound. SKIP LOCKED avoids waiting on another cleanup.
    WITH "expired" AS (
        SELECT
            "scope",
            "identifier_key_version",
            "identifier_digest",
            "window_started_at"
        FROM "app_private"."rate_limit_bucket"
        WHERE "expires_at" <= "v_now"
        ORDER BY "expires_at"
        FOR UPDATE SKIP LOCKED
        LIMIT 32
    )
    DELETE FROM "app_private"."rate_limit_bucket" AS "bucket"
    USING "expired"
    WHERE "bucket"."scope" = "expired"."scope"
      AND "bucket"."identifier_key_version" = "expired"."identifier_key_version"
      AND "bucket"."identifier_digest" = "expired"."identifier_digest"
      AND "bucket"."window_started_at" = "expired"."window_started_at";

    -- The primary key makes this one atomic row-locking operation. Concurrent
    -- requests for the same identifier/window cannot both consume one slot.
    -- The first denied request advances the counter to limit + 1. Later denied
    -- requests still lock/check the row but do not rewrite it.
    INSERT INTO "app_private"."rate_limit_bucket" AS "bucket" (
        "scope",
        "identifier_key_version",
        "identifier_digest",
        "window_started_at",
        "request_count",
        "expires_at",
        "updated_at"
    ) VALUES (
        "p_scope",
        "p_identifier_key_version",
        "p_identifier_digest",
        "v_window_started_at",
        1,
        "v_expires_at",
        "v_now"
    )
    ON CONFLICT (
        "scope",
        "identifier_key_version",
        "identifier_digest",
        "window_started_at"
    ) DO UPDATE
    SET
        "request_count" = "bucket"."request_count" + 1,
        "updated_at" = "v_now"
    WHERE "bucket"."request_count" <= "v_limit"
    RETURNING "bucket"."request_count" INTO "v_request_count";

    -- ON CONFLICT ... DO UPDATE ... WHERE returns no row when the existing
    -- bucket is already over its limit. Treat that as a denial without an
    -- additional UPDATE/dead tuple.
    IF NOT FOUND THEN
        "v_request_count" := "v_limit" + 1;
    END IF;

    RETURN QUERY SELECT
        "v_request_count" <= "v_limit",
        GREATEST("v_limit" - "v_request_count", 0),
        GREATEST(
            CEIL(EXTRACT(EPOCH FROM ("v_expires_at" - "v_now")))::INTEGER,
            1
        );
END;
$$;

-- New tables and functions receive PUBLIC defaults in PostgreSQL. Remove them
-- explicitly and grant the runtime only the function call it requires.
REVOKE ALL ON TABLE "app_private"."rate_limit_bucket"
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

REVOKE ALL ON FUNCTION "app_private"."consume_rate_limit"(TEXT, BYTEA, SMALLINT)
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

GRANT EXECUTE
ON FUNCTION "app_private"."consume_rate_limit"(TEXT, BYTEA, SMALLINT)
TO "bawean_app";

COMMIT;
