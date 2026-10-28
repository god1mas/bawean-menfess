BEGIN;

-- P7.2 policy implementation. This migration prepares owner-only retention
-- maintenance; it does not schedule or execute cleanup.

ALTER TABLE "app_private"."menfess"
ADD COLUMN "legal_hold_at" TIMESTAMPTZ(6),
ADD COLUMN "legal_hold_reason" VARCHAR(500),
ADD CONSTRAINT "menfess_legal_hold_complete_check" CHECK (
  ("legal_hold_at" IS NULL AND "legal_hold_reason" IS NULL)
  OR (
    "legal_hold_at" IS NOT NULL
    AND char_length(btrim("legal_hold_reason")) BETWEEN 1 AND 500
  )
);

CREATE INDEX "menfess_retention_candidate_idx"
ON "app_private"."menfess" ("status", "submitted_at")
WHERE "legal_hold_at" IS NULL;

CREATE TABLE "app_private"."publication_removal" (
  "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  "menfess_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "removed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_removal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publication_removal_reason_not_blank_check"
    CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000),
  CONSTRAINT "publication_removal_menfess_id_fkey"
    FOREIGN KEY ("menfess_id") REFERENCES "app_private"."menfess"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publication_removal_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "app_private"."auth_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "publication_removal_menfess_id_key"
ON "app_private"."publication_removal" ("menfess_id");
CREATE UNIQUE INDEX "publication_removal_idempotency_key_key"
ON "app_private"."publication_removal" ("idempotency_key");
CREATE INDEX "publication_removal_removed_at_idx"
ON "app_private"."publication_removal" ("removed_at" DESC);
CREATE INDEX "publication_removal_actor_user_id_removed_at_idx"
ON "app_private"."publication_removal" ("actor_user_id", "removed_at" DESC);

CREATE FUNCTION "app_private"."validate_publication_removal_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "app_private"."auth_user"
    WHERE "id" = NEW."actor_user_id" AND "role" = 'admin'
  ) THEN
    RAISE EXCEPTION 'publication removal actor must be an administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "app_private"."menfess"
    WHERE "id" = NEW."menfess_id" AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'only a published menfess can record publication removal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "publication_removal_insert_guard"
BEFORE INSERT ON "app_private"."publication_removal"
FOR EACH ROW EXECUTE FUNCTION "app_private"."validate_publication_removal_insert"();

CREATE FUNCTION "app_private"."prevent_publication_removal_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND CURRENT_USER = 'postgres'
     AND pg_catalog.current_setting('app.retention_cleanup', true) = 'enabled' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'publication removal records are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "publication_removal_append_only"
BEFORE UPDATE OR DELETE ON "app_private"."publication_removal"
FOR EACH ROW EXECUTE FUNCTION "app_private"."prevent_publication_removal_mutation"();

CREATE TRIGGER "publication_removal_no_truncate"
BEFORE TRUNCATE ON "app_private"."publication_removal"
FOR EACH STATEMENT EXECUTE FUNCTION "app_private"."prevent_publication_removal_mutation"();

-- Preserve append-only behavior for every caller except the ungrantable,
-- owner-only retention function below. Merely setting the GUC as bawean_app
-- cannot bypass the CURRENT_USER owner check.
CREATE OR REPLACE FUNCTION "app_private"."prevent_moderation_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND CURRENT_USER = 'postgres'
     AND pg_catalog.current_setting('app.retention_cleanup', true) = 'enabled' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'moderation logs are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE "app_private"."retention_cleanup_run" (
  "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6) NOT NULL,
  "menfess_deleted" INTEGER NOT NULL,
  "moderation_logs_deleted" INTEGER NOT NULL,
  "publication_removals_deleted" INTEGER NOT NULL,
  "rate_limit_rows_deleted" INTEGER NOT NULL,
  CONSTRAINT "retention_cleanup_run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retention_cleanup_run_counts_nonnegative_check" CHECK (
    "menfess_deleted" >= 0
    AND "moderation_logs_deleted" >= 0
    AND "publication_removals_deleted" >= 0
    AND "rate_limit_rows_deleted" >= 0
  )
);

CREATE INDEX "retention_cleanup_run_started_at_idx"
ON "app_private"."retention_cleanup_run" ("started_at" DESC);

CREATE TRIGGER "retention_cleanup_run_append_only"
BEFORE UPDATE OR DELETE ON "app_private"."retention_cleanup_run"
FOR EACH ROW EXECUTE FUNCTION "app_private"."prevent_moderation_log_mutation"();
CREATE TRIGGER "retention_cleanup_run_no_truncate"
BEFORE TRUNCATE ON "app_private"."retention_cleanup_run"
FOR EACH STATEMENT EXECUTE FUNCTION "app_private"."prevent_moderation_log_mutation"();

CREATE FUNCTION "app_private"."set_menfess_legal_hold"("target_id" UUID, "hold_reason" TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF target_id IS NULL OR hold_reason IS NULL
     OR char_length(btrim(hold_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'a target and a 1-500 character hold reason are required'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);
  UPDATE "app_private"."menfess"
  SET "legal_hold_at" = pg_catalog.clock_timestamp(),
      "legal_hold_reason" = btrim(hold_reason),
      "updated_at" = pg_catalog.clock_timestamp()
  WHERE "id" = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'menfess not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE FUNCTION "app_private"."release_menfess_legal_hold"("target_id" UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'a target is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);
  UPDATE "app_private"."menfess"
  SET "legal_hold_at" = NULL, "legal_hold_reason" = NULL,
      "updated_at" = pg_catalog.clock_timestamp()
  WHERE "id" = target_id AND "legal_hold_at" IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'held menfess not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE FUNCTION "app_private"."run_retention_cleanup"("batch_size" INTEGER DEFAULT 500)
RETURNS TABLE (
  "menfess_deleted" INTEGER,
  "moderation_logs_deleted" INTEGER,
  "publication_removals_deleted" INTEGER,
  "rate_limit_rows_deleted" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate_ids UUID[];
  started TIMESTAMPTZ(6) := pg_catalog.clock_timestamp();
BEGIN
  IF batch_size IS NULL OR batch_size < 1 OR batch_size > 5000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 5000'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);

  SELECT pg_catalog.array_agg(candidate."id") INTO candidate_ids
  FROM (
    SELECT menfess."id"
    FROM "app_private"."menfess" AS menfess
    WHERE menfess."legal_hold_at" IS NULL
      AND (
        (menfess."status" = 'PENDING'
          AND menfess."submitted_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days')
        OR (menfess."status" = 'APPROVED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id"
            AND log."action" = 'APPROVE'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'
        ))
        OR (menfess."status" = 'REJECTED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id"
            AND log."action" = 'REJECT'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'
        ))
        OR (menfess."status" = 'PUBLISHED'
          AND menfess."published_at" <= pg_catalog.clock_timestamp() - INTERVAL '365 days')
      )
    ORDER BY menfess."submitted_at", menfess."id"
    LIMIT batch_size
    FOR UPDATE OF menfess SKIP LOCKED
  ) AS candidate;

  menfess_deleted := 0;
  moderation_logs_deleted := 0;
  publication_removals_deleted := 0;

  IF candidate_ids IS NOT NULL THEN
    PERFORM pg_catalog.set_config('app.retention_cleanup', 'enabled', true);

    DELETE FROM "app_private"."publication_removal"
    WHERE "menfess_id" = ANY(candidate_ids);
    GET DIAGNOSTICS publication_removals_deleted = ROW_COUNT;

    DELETE FROM "app_private"."moderation_log"
    WHERE "menfess_id" = ANY(candidate_ids);
    GET DIAGNOSTICS moderation_logs_deleted = ROW_COUNT;

    DELETE FROM "app_private"."menfess"
    WHERE "id" = ANY(candidate_ids) AND "legal_hold_at" IS NULL;
    GET DIAGNOSTICS menfess_deleted = ROW_COUNT;
  END IF;

  DELETE FROM "app_private"."rate_limit_bucket"
  WHERE ctid IN (
    SELECT ctid FROM "app_private"."rate_limit_bucket"
    WHERE "expires_at" <= pg_catalog.clock_timestamp()
    ORDER BY "expires_at"
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS rate_limit_rows_deleted = ROW_COUNT;

  INSERT INTO "app_private"."retention_cleanup_run" (
    "started_at", "finished_at", "menfess_deleted",
    "moderation_logs_deleted", "publication_removals_deleted",
    "rate_limit_rows_deleted"
  ) VALUES (
    started, pg_catalog.clock_timestamp(), menfess_deleted,
    moderation_logs_deleted, publication_removals_deleted,
    rate_limit_rows_deleted
  );

  RETURN NEXT;
END;
$$;

ALTER TABLE "app_private"."publication_removal" OWNER TO "postgres";
ALTER TABLE "app_private"."retention_cleanup_run" OWNER TO "postgres";
ALTER FUNCTION "app_private"."validate_publication_removal_insert"() OWNER TO "postgres";
ALTER FUNCTION "app_private"."prevent_publication_removal_mutation"() OWNER TO "postgres";
ALTER FUNCTION "app_private"."prevent_moderation_log_mutation"() OWNER TO "postgres";
ALTER FUNCTION "app_private"."set_menfess_legal_hold"(UUID, TEXT) OWNER TO "postgres";
ALTER FUNCTION "app_private"."release_menfess_legal_hold"(UUID) OWNER TO "postgres";
ALTER FUNCTION "app_private"."run_retention_cleanup"(INTEGER) OWNER TO "postgres";

REVOKE ALL ON TABLE "app_private"."publication_removal", "app_private"."retention_cleanup_run"
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";
REVOKE ALL ON FUNCTION "app_private"."validate_publication_removal_insert"(),
  "app_private"."prevent_publication_removal_mutation"(),
  "app_private"."prevent_moderation_log_mutation"(),
  "app_private"."set_menfess_legal_hold"(UUID, TEXT),
  "app_private"."release_menfess_legal_hold"(UUID),
  "app_private"."run_retention_cleanup"(INTEGER)
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

GRANT SELECT ON TABLE "app_private"."publication_removal" TO "bawean_app";
GRANT INSERT ("menfess_id", "actor_user_id", "idempotency_key", "reason")
ON TABLE "app_private"."publication_removal" TO "bawean_app";

-- Legal holds and cleanup evidence remain owner-only. The runtime role receives
-- neither UPDATE on hold columns nor access to retention_cleanup_run or the
-- cleanup function.

COMMIT;
