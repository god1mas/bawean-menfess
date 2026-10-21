\set ON_ERROR_STOP on
\pset pager off

-- Read-only verification. Run as the migration owner after provisioning.
SELECT
    rolname,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolreplication,
    rolbypassrls,
    rolinherit,
    rolconfig
FROM pg_catalog.pg_roles
WHERE rolname = 'bawean_app';

-- Must return zero rows. NOINHERIT does not prevent SET ROLE, so membership is
-- forbidden rather than merely made non-inheriting.
SELECT parent.rolname AS granted_role
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
WHERE member.rolname = 'bawean_app';

-- Must return zero rows: the runtime role must not own database objects.
SELECT 'schema' AS object_type, namespace.nspname AS object_name
FROM pg_catalog.pg_namespace AS namespace
WHERE namespace.nspowner = 'bawean_app'::regrole
UNION ALL
SELECT 'relation', format('%I.%I', namespace.nspname, relation.relname)
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE relation.relowner = 'bawean_app'::regrole
UNION ALL
SELECT 'function', procedure.oid::regprocedure::text
FROM pg_catalog.pg_proc AS procedure
WHERE procedure.proowner = 'bawean_app'::regrole
UNION ALL
SELECT 'type', format('%I.%I', namespace.nspname, type.typname)
FROM pg_catalog.pg_type AS type
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = type.typnamespace
WHERE type.typowner = 'bawean_app'::regrole
ORDER BY 1, 2;

SELECT pg_catalog.to_regnamespace('app_private') IS NOT NULL AS app_private_exists
\gset

\if :app_private_exists
    SELECT
        has_schema_privilege('bawean_app', 'app_private', 'USAGE') AS schema_usage,
        has_schema_privilege('bawean_app', 'app_private', 'CREATE') AS schema_create;

    SELECT
        table_name,
        privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'bawean_app'
      AND table_schema = 'app_private'
    ORDER BY table_name, privilege_type;

    SELECT
        table_name,
        column_name,
        privilege_type
    FROM information_schema.role_column_grants
    WHERE grantee = 'bawean_app'
      AND table_schema = 'app_private'
    ORDER BY table_name, column_name, privilege_type;

    SELECT
        has_table_privilege('bawean_app', 'app_private.moderation_log', 'UPDATE') AS audit_update,
        has_table_privilege('bawean_app', 'app_private.moderation_log', 'DELETE') AS audit_delete,
        has_table_privilege('bawean_app', 'app_private.moderation_log', 'TRUNCATE') AS audit_truncate,
        has_table_privilege('bawean_app', 'app_private.moderation_log', 'TRIGGER') AS audit_trigger,
        has_column_privilege('bawean_app', 'app_private.auth_user', 'role', 'UPDATE') AS user_role_update,
        has_table_privilege('bawean_app', 'app_private.auth_user', 'INSERT') AS user_insert,
        has_table_privilege('bawean_app', 'app_private.auth_user', 'DELETE') AS user_delete;

\else
    \echo 'app_private does not exist yet; application grants are not verifiable until after migration.'
\endif

-- Run this before the migration too. Results are effective privileges outside
-- app_private, including privileges inherited from PostgreSQL PUBLIC.
SELECT
    namespace.nspname AS schema_name,
    relation.relname AS object_name,
    relation.relkind,
    privilege.privilege
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
CROSS JOIN (
    VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('USAGE')
) AS privilege(privilege)
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema', 'app_private')
  AND has_schema_privilege('bawean_app', namespace.oid, 'USAGE')
  AND CASE
      WHEN relation.relkind = 'S' THEN
          CASE
              WHEN privilege.privilege IN ('SELECT', 'UPDATE', 'USAGE') THEN
                  has_sequence_privilege('bawean_app', relation.oid, privilege.privilege)
              ELSE false
          END
      ELSE
          CASE
              WHEN relation.relkind IN ('r', 'p', 'v', 'm', 'f')
                  AND privilege.privilege <> 'USAGE' THEN
                  has_table_privilege('bawean_app', relation.oid, privilege.privilege)
              ELSE false
          END
  END
ORDER BY 1, 2, 4;

SELECT
    namespace.nspname AS schema_name,
    procedure.oid::regprocedure::text AS function_name,
    has_function_privilege('bawean_app', procedure.oid, 'EXECUTE') AS can_execute
FROM pg_catalog.pg_proc AS procedure
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema', 'app_private')
  AND has_schema_privilege('bawean_app', namespace.oid, 'USAGE')
  AND has_function_privilege('bawean_app', procedure.oid, 'EXECUTE')
ORDER BY 1, 2;

SELECT
    has_database_privilege('bawean_app', current_database(), 'CONNECT') AS database_connect,
    has_database_privilege('bawean_app', current_database(), 'TEMPORARY') AS database_temporary;
