\set ON_ERROR_STOP on

-- Run with psql over the certificate-verified migration-owner connection.
-- This file intentionally contains no password and performs no lookup, grant,
-- ownership change, or DDL against app_private, so it is safe to run before
-- the initial application migration.

SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'bawean_app'
) AS bawean_app_already_exists
\gset

\if :bawean_app_already_exists
    \echo 'ERROR: role bawean_app already exists; inspect it before continuing.'
    \quit 3
\endif

BEGIN;

CREATE ROLE "bawean_app"
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    NOINHERIT
    PASSWORD NULL;

-- PostgreSQL accepts a search_path entry before that schema exists. This is a
-- defensive lookup default, not a permission boundary. All application SQL
-- and migration objects remain schema-qualified.
ALTER ROLE "bawean_app" SET search_path = "app_private", pg_catalog;

COMMIT;

-- psql prompts without placing the cleartext password in this file, command
-- history, pg_stat_activity, or the server log. Cancelling leaves the role
-- unable to authenticate because it was created with PASSWORD NULL.
\password bawean_app
