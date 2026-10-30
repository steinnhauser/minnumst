#!/bin/sh
# Run once by the postgres image (from /docker-entrypoint-initdb.d) when the data
# directory is created. Creates three login roles, none a superuser nor able to
# create roles or databases:
#   - the migration role owns the application database and its schema;
#   - the runtime role (the API) may only connect; migrations grant it the
#     table privileges it needs, and nothing that could rewrite story revisions;
#   - Authentik's role owns Authentik's own database and can't reach the other.
psql --set ON_ERROR_STOP=1 \
  --set migration_user="$MINNUMST_MIGRATION_USER" \
  --set migration_password="$MINNUMST_MIGRATION_PASSWORD" \
  --set app_user="$MINNUMST_APP_USER" \
  --set app_password="$MINNUMST_APP_PASSWORD" \
  --set db="$POSTGRES_DB" \
  --set authentik_db="$MINNUMST_AUTHENTIK_DATABASE" \
  --set authentik_user="$MINNUMST_AUTHENTIK_USER" \
  --set authentik_password="$MINNUMST_AUTHENTIK_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE :"migration_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE :"db" OWNER TO :"migration_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
CREATE ROLE :"authentik_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'authentik_password';
CREATE DATABASE :"authentik_db" OWNER :"authentik_user";
REVOKE ALL ON DATABASE :"authentik_db" FROM PUBLIC;
SQL
