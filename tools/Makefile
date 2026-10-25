ROOT := $(abspath ..)
TOOLS := $(abspath .)

WEB_DIR := $(ROOT)/web
ADMIN_DIR := $(ROOT)/admin
API_DIR := $(ROOT)/api
DEPLOY_DIR := $(ROOT)/deploy

UV ?= uv
RUFF := $(UV) run --project "$(API_DIR)" ruff
SHELLCHECK := $(UV) tool run --from shellcheck-py==0.11.0.1 shellcheck

.PHONY: help status format format-check lint check \
	validate validate-public validate-admin validate-api validate-deploy \
	compose-render compose-config compose-up compose-wait compose-down compose-ps compose-logs \
	db-seed db-update db-clear db-reset e2e

help:
	@printf '%s\n' \
	  'status           Show Git status for the repository' \
	  'format           Format the Python scripts in tools/' \
	  'format-check     Check formatting of the Python scripts in tools/' \
	  'lint             Lint the tools/ Python scripts (Ruff) and shell scripts (ShellCheck)' \
	  'check            Run format-check and lint for tools/' \
	  'validate         Run validation in all four components (see the root Makefile)' \
	  'validate-public  Validate the public frontend' \
	  'validate-admin   Validate the admin frontend' \
	  'validate-api     Validate the API' \
	  'validate-deploy  Validate the Ansible deployment project' \
	  'compose-render   Render the deployment Compose template locally' \
	  'compose-config   Validate the rendered local Compose configuration' \
	  'compose-up       Start app and database containers on loopback ports' \
	  'compose-wait     Wait until the API is ready and both frontends serve' \
	  'compose-down     Stop local app and database containers' \
	  'compose-ps       Show local Compose service status' \
	  'compose-logs     Follow local Compose logs (SERVICES=api for one service)' \
	  'db-seed          Idempotently add local sample people and stories' \
	  'db-update        Append revisions if the sample template has changed' \
	  'db-clear         Destructively recreate the local database schema' \
	  'db-reset         Destructively clear the local database and reseed samples' \
	  'e2e              Exercise API read/write routes against local MariaDB'

status:
	@git -C "$(ROOT)" status --short --branch

format:
	$(RUFF) format scripts

format-check:
	$(RUFF) format --check scripts

lint:
	$(RUFF) check scripts
	$(SHELLCHECK) scripts/*.sh

check: format-check lint

validate: validate-public validate-admin validate-api validate-deploy

validate-public:
	$(MAKE) -C "$(WEB_DIR)" validate

validate-admin:
	$(MAKE) -C "$(ADMIN_DIR)" validate

validate-api:
	$(MAKE) -C "$(API_DIR)" validate

validate-deploy:
	$(MAKE) -C "$(DEPLOY_DIR)" validate


compose-render:
	bash "$(TOOLS)/scripts/compose.sh" render

compose-config:
	bash "$(TOOLS)/scripts/compose.sh" config

compose-up:
	bash "$(TOOLS)/scripts/compose.sh" up

compose-wait:
	bash "$(TOOLS)/scripts/compose.sh" wait

compose-down:
	bash "$(TOOLS)/scripts/compose.sh" down

compose-ps:
	bash "$(TOOLS)/scripts/compose.sh" ps

compose-logs:
	bash "$(TOOLS)/scripts/compose.sh" logs $(SERVICES)

db-seed:
	bash "$(TOOLS)/scripts/compose.sh" seed

db-update:
	bash "$(TOOLS)/scripts/compose.sh" update

db-clear:
	bash "$(TOOLS)/scripts/compose.sh" clear

db-reset:
	bash "$(TOOLS)/scripts/compose.sh" reset

e2e:
	bash "$(TOOLS)/scripts/compose.sh" e2e
