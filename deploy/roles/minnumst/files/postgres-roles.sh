#!/bin/sh
# Run once by the postgres image (from /docker-entrypoint-initdb.d) when the data
# directory is created. Creates two login roles, neither a superuser nor able to
# create roles or databases:
#   - the migration role owns the application database and its schema;
#   - the runtime role (the API) may only connect; migrations grant it the
#     table privileges it needs, and nothing that could rewrite story revisions.
psql --set ON_ERROR_STOP=1 \
  --set migration_user="$MINNUMST_MIGRATION_USER" \
  --set migration_password="$MINNUMST_MIGRATION_PASSWORD" \
  --set app_user="$MINNUMST_APP_USER" \
  --set app_password="$MINNUMST_APP_PASSWORD" \
  --set db="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE :"migration_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE :"db" OWNER TO :"migration_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
SQL
