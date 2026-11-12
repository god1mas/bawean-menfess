BEGIN;

CREATE TABLE "app_private"."menfess_photo" (
  "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  "menfess_id" UUID,
  "object_path" VARCHAR(160) NOT NULL,
  "content_type" VARCHAR(16) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "content_sha256" BYTEA NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'STAGED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menfess_photo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menfess_photo_menfess_id_fkey" FOREIGN KEY ("menfess_id")
    REFERENCES "app_private"."menfess"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "menfess_photo_state_check" CHECK (
    ("state" = 'STAGED' AND "menfess_id" IS NULL) OR
    ("state" = 'ATTACHED' AND "menfess_id" IS NOT NULL) OR
    ("state" = 'DELETE_PENDING' AND "menfess_id" IS NOT NULL) OR
    "state" = 'CLEANING'
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
CREATE POLICY "menfess_photo_runtime_policy" ON "app_private"."menfess_photo"
  FOR ALL TO "bawean_app" USING (true) WITH CHECK (true);
ALTER TABLE "app_private"."menfess_photo" OWNER TO "postgres";
REVOKE ALL ON TABLE "app_private"."menfess_photo"
  FROM PUBLIC, "anon", "authenticated", "service_role", "bawean_app";
GRANT SELECT, DELETE ON TABLE "app_private"."menfess_photo" TO "bawean_app";
GRANT INSERT ("id", "object_path", "content_type", "byte_size", "content_sha256", "state")
  ON TABLE "app_private"."menfess_photo" TO "bawean_app";
GRANT UPDATE ("menfess_id", "state", "updated_at")
  ON TABLE "app_private"."menfess_photo" TO "bawean_app";

COMMIT;
