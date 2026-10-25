#!/bin/sh
# Run once by the postgres image (from /docker-entrypoint-initdb.d) when the data
# directory is created. Creates the API's login role: it owns the application
# database but is not a superuser and cannot create roles or databases.
psql --set ON_ERROR_STOP=1 \
  --set app_user="$MINNUMST_APP_USER" \
  --set app_password="$MINNUMST_APP_PASSWORD" \
  --set db="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE :"db" OWNER TO :"app_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
SQL
