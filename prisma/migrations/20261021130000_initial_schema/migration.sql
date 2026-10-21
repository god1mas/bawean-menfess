-- Prisma Migrate does not wrap PostgreSQL migration files automatically.
-- Keep this initial schema and its privilege changes atomic.
BEGIN;

-- CreateSchema
CREATE SCHEMA "app_private";

-- CreateEnum
CREATE TYPE "app_private"."MenfessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "app_private"."ModerationAction" AS ENUM ('APPROVE', 'REJECT', 'MARK_PUBLISHED');

-- CreateTable
CREATE TABLE "app_private"."auth_user" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'none',

    CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."auth_session" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."auth_account" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."auth_verification" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."category" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "slug" VARCHAR(32) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."menfess" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "tracking_code_digest" BYTEA NOT NULL,
    "tracking_code_key_version" SMALLINT NOT NULL,
    "tracking_url_digest" BYTEA NOT NULL,
    "tracking_url_key_version" SMALLINT NOT NULL,
    "status" "app_private"."MenfessStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "publication_reference" VARCHAR(500),

    CONSTRAINT "menfess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_private"."moderation_log" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "menfess_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "action" "app_private"."ModerationAction" NOT NULL,
    "from_status" "app_private"."MenfessStatus" NOT NULL,
    "to_status" "app_private"."MenfessStatus" NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_email_key" ON "app_private"."auth_user"("email");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "app_private"."auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_session_expires_at_idx" ON "app_private"."auth_session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "app_private"."auth_session"("token");

-- CreateIndex
CREATE INDEX "auth_account_user_id_idx" ON "app_private"."auth_account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_account_provider_id_account_id_key" ON "app_private"."auth_account"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "auth_verification_identifier_idx" ON "app_private"."auth_verification"("identifier");

-- CreateIndex
CREATE INDEX "auth_verification_expires_at_idx" ON "app_private"."auth_verification"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "app_private"."category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "category_sort_order_key" ON "app_private"."category"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "menfess_tracking_code_digest_key" ON "app_private"."menfess"("tracking_code_digest");

-- CreateIndex
CREATE UNIQUE INDEX "menfess_tracking_url_digest_key" ON "app_private"."menfess"("tracking_url_digest");

-- CreateIndex
CREATE INDEX "menfess_status_submitted_at_idx" ON "app_private"."menfess"("status", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "menfess_category_id_submitted_at_idx" ON "app_private"."menfess"("category_id", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_log_idempotency_key_key" ON "app_private"."moderation_log"("idempotency_key");

-- CreateIndex
CREATE INDEX "moderation_log_menfess_id_created_at_idx" ON "app_private"."moderation_log"("menfess_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_log_actor_user_id_created_at_idx" ON "app_private"."moderation_log"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_log_to_status_created_at_idx" ON "app_private"."moderation_log"("to_status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_log_menfess_id_action_key" ON "app_private"."moderation_log"("menfess_id", "action");

-- AddForeignKey
ALTER TABLE "app_private"."auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_private"."auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_private"."auth_account" ADD CONSTRAINT "auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_private"."auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_private"."menfess" ADD CONSTRAINT "menfess_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app_private"."category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_private"."moderation_log" ADD CONSTRAINT "moderation_log_menfess_id_fkey" FOREIGN KEY ("menfess_id") REFERENCES "app_private"."menfess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_private"."moderation_log" ADD CONSTRAINT "moderation_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_private"."auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomConstraint
ALTER TABLE "app_private"."auth_user"
ADD CONSTRAINT "auth_user_role_check"
CHECK ("role" IN ('none', 'admin'));

-- CustomConstraint
ALTER TABLE "app_private"."category"
ADD CONSTRAINT "category_slug_not_blank_check"
CHECK (char_length(btrim("slug")) > 0),
ADD CONSTRAINT "category_label_not_blank_check"
CHECK (char_length(btrim("label")) > 0),
ADD CONSTRAINT "category_sort_order_positive_check"
CHECK ("sort_order" > 0);

-- CustomConstraint
ALTER TABLE "app_private"."menfess"
ADD CONSTRAINT "menfess_message_length_check"
CHECK (char_length(btrim("message")) BETWEEN 1 AND 1000),
ADD CONSTRAINT "menfess_tracking_code_digest_length_check"
CHECK (octet_length("tracking_code_digest") = 32),
ADD CONSTRAINT "menfess_tracking_code_key_version_positive_check"
CHECK ("tracking_code_key_version" > 0),
ADD CONSTRAINT "menfess_tracking_url_digest_length_check"
CHECK (octet_length("tracking_url_digest") = 32),
ADD CONSTRAINT "menfess_tracking_url_key_version_positive_check"
CHECK ("tracking_url_key_version" > 0),
ADD CONSTRAINT "menfess_version_nonnegative_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "menfess_published_at_status_check"
CHECK (("status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
ADD CONSTRAINT "menfess_publication_reference_status_check"
CHECK ("publication_reference" IS NULL OR "status" = 'PUBLISHED');

-- CustomConstraint
ALTER TABLE "app_private"."moderation_log"
ADD CONSTRAINT "moderation_log_approved_transition_check"
CHECK (
    ("action" = 'APPROVE' AND "from_status" = 'PENDING' AND "to_status" = 'APPROVED')
    OR ("action" = 'REJECT' AND "from_status" = 'PENDING' AND "to_status" = 'REJECTED')
    OR ("action" = 'MARK_PUBLISHED' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
);

-- CustomFunction
CREATE FUNCTION "app_private"."enforce_menfess_status_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW."status" = OLD."status" THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD."status" = 'PENDING' AND NEW."status" IN ('APPROVED', 'REJECTED'))
        OR (OLD."status" = 'APPROVED' AND NEW."status" = 'PUBLISHED')
    ) THEN
        RAISE EXCEPTION 'invalid menfess status transition'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION 'menfess status transition must increment version once'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- CustomTrigger
CREATE TRIGGER "menfess_status_transition_guard"
BEFORE UPDATE OF "status" ON "app_private"."menfess"
FOR EACH ROW
EXECUTE FUNCTION "app_private"."enforce_menfess_status_transition"();

-- CustomFunction
CREATE FUNCTION "app_private"."enforce_menfess_version_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW."status" = OLD."status" AND NEW."version" <> OLD."version" THEN
        RAISE EXCEPTION 'menfess version may change only with status'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."status" <> OLD."status" AND NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION 'menfess status transition must increment version once'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- CustomTrigger
CREATE TRIGGER "menfess_version_guard"
BEFORE UPDATE OF "version" ON "app_private"."menfess"
FOR EACH ROW
EXECUTE FUNCTION "app_private"."enforce_menfess_version_change"();

-- CustomFunction
CREATE FUNCTION "app_private"."validate_moderation_log_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "app_private"."auth_user"
        WHERE "id" = NEW."actor_user_id"
          AND "role" = 'admin'
    ) THEN
        RAISE EXCEPTION 'moderation log actor must be an administrator'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "app_private"."menfess"
        WHERE "id" = NEW."menfess_id"
          AND "status" = NEW."to_status"
    ) THEN
        RAISE EXCEPTION 'moderation log target state does not match menfess state'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- CustomTrigger
CREATE TRIGGER "moderation_log_insert_guard"
BEFORE INSERT ON "app_private"."moderation_log"
FOR EACH ROW
EXECUTE FUNCTION "app_private"."validate_moderation_log_insert"();

-- CustomFunction
CREATE FUNCTION "app_private"."require_moderation_log_for_status_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "app_private"."moderation_log"
        WHERE "menfess_id" = NEW."id"
          AND "from_status" = OLD."status"
          AND "to_status" = NEW."status"
    ) THEN
        RAISE EXCEPTION 'menfess status transition requires a moderation log'
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

-- CustomTrigger
CREATE CONSTRAINT TRIGGER "menfess_status_transition_audit"
AFTER UPDATE OF "status" ON "app_private"."menfess"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "app_private"."require_moderation_log_for_status_transition"();

-- CustomFunction
CREATE FUNCTION "app_private"."prevent_moderation_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'moderation logs are append-only'
        USING ERRCODE = '55000';
END;
$$;

-- CustomTrigger
CREATE TRIGGER "moderation_log_append_only"
BEFORE UPDATE OR DELETE ON "app_private"."moderation_log"
FOR EACH ROW
EXECUTE FUNCTION "app_private"."prevent_moderation_log_mutation"();

-- CustomTrigger
CREATE TRIGGER "moderation_log_no_truncate"
BEFORE TRUNCATE ON "app_private"."moderation_log"
FOR EACH STATEMENT
EXECUTE FUNCTION "app_private"."prevent_moderation_log_mutation"();

-- PrivateSchemaPrivileges
REVOKE ALL ON SCHEMA "app_private" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL TABLES IN SCHEMA "app_private" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "app_private" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "app_private" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TYPE "app_private"."MenfessStatus", "app_private"."ModerationAction"
FROM PUBLIC, "anon", "authenticated", "service_role";

-- RuntimeRolePrivileges
-- The role is provisioned separately before this migration. Revoke first so
-- rerunning this reviewed privilege block cannot retain broader direct grants.
REVOKE ALL ON SCHEMA "app_private" FROM "bawean_app";
REVOKE ALL ON ALL TABLES IN SCHEMA "app_private" FROM "bawean_app";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "app_private" FROM "bawean_app";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "app_private" FROM "bawean_app";
REVOKE ALL ON TYPE "app_private"."MenfessStatus", "app_private"."ModerationAction"
FROM "bawean_app";

GRANT USAGE ON SCHEMA "app_private" TO "bawean_app";
GRANT USAGE ON TYPE "app_private"."MenfessStatus" TO "bawean_app";
GRANT USAGE ON TYPE "app_private"."ModerationAction" TO "bawean_app";

GRANT SELECT ON TABLE "app_private"."category" TO "bawean_app";

GRANT SELECT ON TABLE "app_private"."menfess" TO "bawean_app";
GRANT INSERT (
    "category_id",
    "message",
    "tracking_code_digest",
    "tracking_code_key_version",
    "tracking_url_digest",
    "tracking_url_key_version",
    "updated_at"
) ON TABLE "app_private"."menfess" TO "bawean_app";
GRANT UPDATE (
    "status",
    "version",
    "updated_at",
    "published_at",
    "publication_reference"
) ON TABLE "app_private"."menfess" TO "bawean_app";

GRANT SELECT ON TABLE "app_private"."moderation_log" TO "bawean_app";
GRANT INSERT (
    "menfess_id",
    "actor_user_id",
    "idempotency_key",
    "action",
    "from_status",
    "to_status",
    "note"
) ON TABLE "app_private"."moderation_log" TO "bawean_app";

-- Public signup and runtime administrator provisioning are prohibited. The
-- runtime can read existing users and update only Better Auth profile and
-- verification fields; it cannot insert/delete users or change `role`.
GRANT SELECT ON TABLE "app_private"."auth_user" TO "bawean_app";
GRANT UPDATE (
    "name",
    "email",
    "email_verified",
    "image",
    "updated_at"
) ON TABLE "app_private"."auth_user" TO "bawean_app";

GRANT SELECT, INSERT, DELETE ON TABLE "app_private"."auth_session" TO "bawean_app";
GRANT UPDATE (
    "expires_at",
    "token",
    "updated_at",
    "ip_address",
    "user_agent"
) ON TABLE "app_private"."auth_session" TO "bawean_app";

GRANT SELECT, INSERT, DELETE ON TABLE "app_private"."auth_account" TO "bawean_app";
GRANT UPDATE (
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password",
    "updated_at"
) ON TABLE "app_private"."auth_account" TO "bawean_app";

GRANT SELECT, INSERT, DELETE ON TABLE "app_private"."auth_verification" TO "bawean_app";

-- PostgreSQL grants PUBLIC access to new routines and types by default. A
-- schema-scoped ALTER DEFAULT PRIVILEGES cannot remove those global built-in
-- defaults, so every future migration that creates a routine or type in this
-- schema must revoke it in the same transaction. Changing the owner's global
-- defaults here would also affect unrelated schemas and is intentionally
-- avoided.

COMMIT;
