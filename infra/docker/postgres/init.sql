-- Runs once, on first start of the local Postgres container (as the postgres superuser).
-- Production: create the same two roles with your managed-Postgres tooling.

-- Owner role: owns the schema, runs migrations and seed. Never used by the running API.
-- CREATEDB locally only, so `prisma migrate dev` can create its shadow database.
CREATE ROLE gym_owner LOGIN PASSWORD 'gym_owner_dev' CREATEDB;
-- App role: what the API and worker connect as. Cannot bypass Row-Level Security.
CREATE ROLE gym_app LOGIN PASSWORD 'gym_app_dev' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE gym OWNER gym_owner;
CREATE DATABASE keycloak OWNER postgres;

\connect gym
ALTER SCHEMA public OWNER TO gym_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gym_app;
