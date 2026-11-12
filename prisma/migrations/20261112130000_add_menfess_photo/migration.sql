BEGIN;

CREATE TABLE "app_private"."menfess_photo" (
  "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  "menfess_id" UUID,
  "object_path" VARCHAR(160) NOT NULL,
  "content_type" VARCHAR(16) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "content_sha256" BYTEA NOT NULL,
  "state" VARCHAR(20) NOT NULL DEFAULT 'STAGED',
  "retention_queued_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menfess_photo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menfess_photo_menfess_id_fkey" FOREIGN KEY ("menfess_id")
    REFERENCES "app_private"."menfess"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "menfess_photo_state_check" CHECK (
    ("state" = 'STAGED' AND "menfess_id" IS NULL AND "retention_queued_at" IS NULL) OR
    ("state" = 'ATTACHED' AND "menfess_id" IS NOT NULL AND "retention_queued_at" IS NULL) OR
    ("state" = 'DELETE_PENDING' AND "menfess_id" IS NOT NULL AND "retention_queued_at" IS NULL) OR
    ("state" IN ('RETENTION_PENDING', 'RETENTION_CLEANED')
      AND "menfess_id" IS NOT NULL AND "retention_queued_at" IS NOT NULL) OR
    ("state" = 'CLEANING' AND
      ("retention_queued_at" IS NULL OR "menfess_id" IS NOT NULL))
  ),
  CONSTRAINT "menfess_photo_size_check" CHECK ("byte_size" BETWEEN 1 AND 1048576),
  CONSTRAINT "menfess_photo_type_check" CHECK
    ("content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "menfess_photo_digest_check" CHECK
    (pg_catalog.octet_length("content_sha256") = 32),
  CONSTRAINT "menfess_photo_path_check" CHECK
    ("object_path" ~ '^photos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$')
);

CREATE UNIQUE INDEX "menfess_photo_menfess_id_key"
  ON "app_private"."menfess_photo"("menfess_id");
CREATE UNIQUE INDEX "menfess_photo_object_path_key"
  ON "app_private"."menfess_photo"("object_path");
CREATE INDEX "menfess_photo_state_created_at_idx"
  ON "app_private"."menfess_photo"("state", "created_at");

ALTER TABLE "app_private"."menfess_photo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menfess_photo_runtime_select" ON "app_private"."menfess_photo"
  FOR SELECT TO "bawean_app" USING (true);
CREATE POLICY "menfess_photo_runtime_insert" ON "app_private"."menfess_photo"
  FOR INSERT TO "bawean_app" WITH CHECK ("state" = 'STAGED' AND "menfess_id" IS NULL);
CREATE POLICY "menfess_photo_runtime_update" ON "app_private"."menfess_photo"
  FOR UPDATE TO "bawean_app" USING (true) WITH CHECK (true);
CREATE POLICY "menfess_photo_runtime_delete" ON "app_private"."menfess_photo"
  FOR DELETE TO "bawean_app" USING ("state" = 'CLEANING');
ALTER TABLE "app_private"."menfess_photo" OWNER TO "postgres";
REVOKE ALL ON TABLE "app_private"."menfess_photo"
  FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";
GRANT SELECT, DELETE ON TABLE "app_private"."menfess_photo" TO "bawean_app";
GRANT INSERT ("id", "object_path", "content_type", "byte_size", "content_sha256", "state")
  ON TABLE "app_private"."menfess_photo" TO "bawean_app";
GRANT UPDATE ("menfess_id", "state", "updated_at")
  ON TABLE "app_private"."menfess_photo" TO "bawean_app";

CREATE FUNCTION "app_private"."guard_photo_retention_state"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF CURRENT_USER <> 'postgres' AND (
    (NEW."state" = 'RETENTION_PENDING' AND OLD."state" NOT IN ('RETENTION_PENDING', 'CLEANING')) OR
    (OLD."state" = 'RETENTION_PENDING' AND NEW."state" = 'ATTACHED') OR
    (NEW."state" = 'RETENTION_CLEANED' AND
      (OLD."state" <> 'CLEANING' OR OLD."retention_queued_at" IS NULL))
  ) THEN
    RAISE EXCEPTION 'retention state is owner-controlled' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "menfess_photo_retention_state_guard"
BEFORE UPDATE ON "app_private"."menfess_photo"
FOR EACH ROW EXECUTE FUNCTION "app_private"."guard_photo_retention_state"();

-- Retention remains owner-only. Queueing is a short database transaction;
-- Storage deletion is performed later via the Storage API, never inside SQL.
CREATE FUNCTION "app_private"."queue_retention_photos"("batch_size" INTEGER DEFAULT 500)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE queued INTEGER;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 OR batch_size > 5000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 5000' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);
  WITH candidates AS MATERIALIZED (
    SELECT menfess."id"
    FROM "app_private"."menfess" AS menfess
    JOIN "app_private"."menfess_photo" AS photo ON photo."menfess_id" = menfess."id"
    WHERE menfess."legal_hold_at" IS NULL AND photo."state" = 'ATTACHED'
      AND (
        (menfess."status" = 'PENDING' AND menfess."submitted_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days')
        OR (menfess."status" = 'APPROVED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id" AND log."action" = 'APPROVE'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'))
        OR (menfess."status" = 'REJECTED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id" AND log."action" = 'REJECT'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'))
        OR (menfess."status" = 'PUBLISHED' AND menfess."published_at" <= pg_catalog.clock_timestamp() - INTERVAL '365 days')
      )
    ORDER BY menfess."submitted_at", menfess."id"
    LIMIT batch_size FOR UPDATE OF menfess SKIP LOCKED
  )
  UPDATE "app_private"."menfess_photo" AS photo
  SET "state" = 'RETENTION_PENDING',
      "retention_queued_at" = pg_catalog.clock_timestamp(),
      "updated_at" = pg_catalog.clock_timestamp()
  FROM candidates WHERE photo."menfess_id" = candidates."id" AND photo."state" = 'ATTACHED';
  GET DIAGNOSTICS queued = ROW_COUNT;
  RETURN queued;
END;
$$;

-- A hold acquired before cleanup cancels the queued photo deletion. Once
-- Storage deletion has been claimed, the hold must be retried after cleanup;
-- if the object is already gone, the hold preserves the remaining menfess
-- and audit data but cannot restore the deleted photo.
CREATE OR REPLACE FUNCTION "app_private"."set_menfess_legal_hold"("target_id" UUID, "hold_reason" TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF target_id IS NULL OR hold_reason IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(hold_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'a target and a 1-500 character hold reason are required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);
  UPDATE "app_private"."menfess"
  SET "legal_hold_at" = pg_catalog.clock_timestamp(),
      "legal_hold_reason" = pg_catalog.btrim(hold_reason),
      "updated_at" = pg_catalog.clock_timestamp()
  WHERE "id" = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'menfess not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM "app_private"."menfess_photo"
             WHERE "menfess_id" = target_id AND "state" = 'CLEANING') THEN
    RAISE EXCEPTION 'photo cleanup in progress; retry legal hold' USING ERRCODE = '55P03';
  END IF;
  UPDATE "app_private"."menfess_photo"
  SET "state" = 'ATTACHED', "retention_queued_at" = NULL,
      "updated_at" = pg_catalog.clock_timestamp()
  WHERE "menfess_id" = target_id AND "state" = 'RETENTION_PENDING';
END;
$$;

CREATE FUNCTION "app_private"."guard_photo_retention_moderation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM 1 FROM "app_private"."menfess_photo"
    WHERE "menfess_id" = OLD."id" AND "state" IN ('RETENTION_PENDING', 'CLEANING', 'RETENTION_CLEANED')
    FOR UPDATE;
    IF FOUND THEN
      RAISE EXCEPTION 'photo retention cleanup in progress; retry moderation' USING ERRCODE = '55P03';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "menfess_photo_retention_moderation_guard"
BEFORE UPDATE OF "status" ON "app_private"."menfess"
FOR EACH ROW EXECUTE FUNCTION "app_private"."guard_photo_retention_moderation"();

-- The existing owner-only retention function must skip photo-bearing rows,
-- including failed deletions, while still processing unrelated candidates.
-- It is replaced below with the same signature, owner and privilege boundary.
CREATE OR REPLACE FUNCTION "app_private"."run_retention_cleanup"("batch_size" INTEGER DEFAULT 500)
RETURNS TABLE (
  "menfess_deleted" INTEGER,
  "moderation_logs_deleted" INTEGER,
  "publication_removals_deleted" INTEGER,
  "rate_limit_rows_deleted" INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate_ids UUID[];
  started TIMESTAMPTZ(6) := pg_catalog.clock_timestamp();
BEGIN
  IF batch_size IS NULL OR batch_size < 1 OR batch_size > 5000 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 5000' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7231072001);
  SELECT pg_catalog.array_agg(candidate."id") INTO candidate_ids
  FROM (
    SELECT menfess."id" FROM "app_private"."menfess" AS menfess
    WHERE menfess."legal_hold_at" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "app_private"."menfess_photo" AS photo
                      WHERE photo."menfess_id" = menfess."id"
                        AND photo."state" <> 'RETENTION_CLEANED')
      AND (
        (menfess."status" = 'PENDING' AND menfess."submitted_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days')
        OR (menfess."status" = 'APPROVED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id" AND log."action" = 'APPROVE'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'))
        OR (menfess."status" = 'REJECTED' AND EXISTS (
          SELECT 1 FROM "app_private"."moderation_log" AS log
          WHERE log."menfess_id" = menfess."id" AND log."action" = 'REJECT'
            AND log."created_at" <= pg_catalog.clock_timestamp() - INTERVAL '90 days'))
        OR (menfess."status" = 'PUBLISHED' AND menfess."published_at" <= pg_catalog.clock_timestamp() - INTERVAL '365 days')
      )
    ORDER BY menfess."submitted_at", menfess."id"
    LIMIT batch_size FOR UPDATE OF menfess SKIP LOCKED
  ) AS candidate;
  menfess_deleted := 0;
  moderation_logs_deleted := 0;
  publication_removals_deleted := 0;
  IF candidate_ids IS NOT NULL THEN
    PERFORM pg_catalog.set_config('app.retention_cleanup', 'enabled', true);
    DELETE FROM "app_private"."menfess_photo"
    WHERE "menfess_id" = ANY(candidate_ids) AND "state" = 'RETENTION_CLEANED';
    DELETE FROM "app_private"."publication_removal" WHERE "menfess_id" = ANY(candidate_ids);
    GET DIAGNOSTICS publication_removals_deleted = ROW_COUNT;
    DELETE FROM "app_private"."moderation_log" WHERE "menfess_id" = ANY(candidate_ids);
    GET DIAGNOSTICS moderation_logs_deleted = ROW_COUNT;
    DELETE FROM "app_private"."menfess" WHERE "id" = ANY(candidate_ids) AND "legal_hold_at" IS NULL;
    GET DIAGNOSTICS menfess_deleted = ROW_COUNT;
  END IF;
  DELETE FROM "app_private"."rate_limit_bucket"
  WHERE ctid IN (
    SELECT ctid FROM "app_private"."rate_limit_bucket"
    WHERE "expires_at" <= pg_catalog.clock_timestamp()
    ORDER BY "expires_at" LIMIT batch_size FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS rate_limit_rows_deleted = ROW_COUNT;
  INSERT INTO "app_private"."retention_cleanup_run" (
    "started_at", "finished_at", "menfess_deleted",
    "moderation_logs_deleted", "publication_removals_deleted", "rate_limit_rows_deleted"
  ) VALUES (
    started, pg_catalog.clock_timestamp(), menfess_deleted,
    moderation_logs_deleted, publication_removals_deleted, rate_limit_rows_deleted
  );
  RETURN NEXT;
END;
$$;

ALTER FUNCTION "app_private"."queue_retention_photos"(INTEGER) OWNER TO "postgres";
ALTER FUNCTION "app_private"."guard_photo_retention_moderation"() OWNER TO "postgres";
ALTER FUNCTION "app_private"."guard_photo_retention_state"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app_private"."queue_retention_photos"(INTEGER),
  "app_private"."guard_photo_retention_moderation"(),
  "app_private"."guard_photo_retention_state"()
FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";

COMMIT;
