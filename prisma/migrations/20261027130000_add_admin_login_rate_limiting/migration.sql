-- LOCAL REVIEW CANDIDATE: production execution requires separate approval.
-- Extends the existing private, atomic limiter to the administrator sign-in
-- endpoint without granting direct access to rate_limit_bucket.
BEGIN;

ALTER TABLE "app_private"."rate_limit_bucket"
DROP CONSTRAINT "rate_limit_bucket_scope_check";

ALTER TABLE "app_private"."rate_limit_bucket"
ADD CONSTRAINT "rate_limit_bucket_scope_check"
CHECK ("scope" IN ('submission', 'tracking', 'admin-login'));

CREATE OR REPLACE FUNCTION "app_private"."consume_rate_limit"(
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
        WHEN 'admin-login' THEN
            "v_limit" := 5;
            "v_window_seconds" := 900;
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

REVOKE ALL ON FUNCTION "app_private"."consume_rate_limit"(TEXT, BYTEA, SMALLINT)
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

GRANT EXECUTE
ON FUNCTION "app_private"."consume_rate_limit"(TEXT, BYTEA, SMALLINT)
TO "bawean_app";

COMMIT;
