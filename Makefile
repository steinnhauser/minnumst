.DEFAULT_GOAL := help

UV ?= uv
TOOLS := $(MAKE) -C tools

# Components that implement each target. deploy/ has no unit tests or build
# artefact; its playbook syntax check runs as part of `test`.
FORMAT_DIRS := api web admin deploy tools
LINT_DIRS := api web admin deploy tools
TEST_DIRS := api web admin
BUILD_DIRS := api web admin

# Markdown and workflow files outside the frontends, which format their own.
# Uses the Prettier version pinned in web/package-lock.json.
PRETTIER := web/node_modules/.bin/prettier
DOCS := '*.md' 'api/*.md' 'deploy/*.md' 'tools/*.md' '.github/**/*.yml'

.PHONY: help install format format-check docs-format docs-format-check lint test test-mariadb build validate clean ci \
	stack-config up wait seed e2e stack-test ps logs down

help:
	@printf '%s\n' \
	  'Checks (run across api/, web/, admin/, deploy/ and tools/):' \
	  '  install       Install locked dependencies for every component' \
	  '  format        Format all code' \
	  '  format-check  Check formatting without changing files' \
	  '  docs-format   Format Markdown and workflow files outside web/ and admin/ (part of format)' \
	  '  lint          Run Ruff, ESLint, ansible-lint and ShellCheck' \
	  '  test          Run unit tests (pytest on SQLite, Vitest) and the playbook syntax check' \
	  '  test-mariadb  Run the API integration tests against MariaDB (needs Docker)' \
	  '  build         Build the API package and both frontends' \
	  '  validate      Run the full validation of every component, as CI does (needs Docker)' \
	  '  clean         Remove build output' \
	  '' \
	  'Local stack (the deploy/ Compose template, rendered by tools/, without Traefik):' \
	  '  stack-config  Render and validate the Compose configuration' \
	  '  up            Build the three images and start MariaDB, API, web and admin' \
	  '  wait          Wait until the API is ready and both frontends serve' \
	  '  seed          Add fictional sample people and stories (idempotent)' \
	  '  e2e           Run the end-to-end API tests against the running stack' \
	  '  stack-test    up, wait, seed and e2e in order' \
	  '  ps            Show service status' \
	  '  logs          Follow logs (SERVICES="api public admin" for some services)' \
	  '  down          Stop the stack; the MariaDB volume is kept' \
	  '' \
	  '  ci            validate, then stack-test' \
	  '' \
	  'Web: http://127.0.0.1:5173  Admin: http://127.0.0.1:5174  API: http://127.0.0.1:8000/docs'

install:
	cd api && $(UV) sync --locked --all-groups
	cd deploy && $(UV) sync --locked --all-groups
	cd web && npm ci
	cd admin && npm ci

format: docs-format
	@set -e; for dir in $(FORMAT_DIRS); do $(MAKE) -C $$dir format; done

format-check: docs-format-check
	@set -e; for dir in $(FORMAT_DIRS); do $(MAKE) -C $$dir format-check; done

docs-format:
	$(PRETTIER) --write $(DOCS)

docs-format-check:
	$(PRETTIER) --check $(DOCS)

lint:
	@set -e; for dir in $(LINT_DIRS); do $(MAKE) -C $$dir lint; done

test:
	@set -e; for dir in $(TEST_DIRS); do $(MAKE) -C $$dir test; done
	$(MAKE) -C deploy syntax-check

test-mariadb:
	$(MAKE) -C api test-mariadb

build:
	@set -e; for dir in $(BUILD_DIRS); do $(MAKE) -C $$dir build; done

validate:
	$(MAKE) -C api validate
	$(MAKE) -C web validate
	$(MAKE) -C admin validate
	$(MAKE) -C deploy validate
	$(TOOLS) check
	$(MAKE) docs-format-check

clean:
	@set -e; for dir in api web admin; do $(MAKE) -C $$dir clean; done

ci:
	$(MAKE) validate
	$(MAKE) stack-test

stack-config:
	$(TOOLS) compose-config

up:
	$(TOOLS) compose-up

wait:
	$(TOOLS) compose-wait

seed:
	$(TOOLS) db-seed

e2e:
	$(TOOLS) e2e

stack-test:
	$(MAKE) up
	$(MAKE) wait
	$(MAKE) seed
	$(MAKE) e2e

ps:
	$(TOOLS) compose-ps

logs:
	$(TOOLS) compose-logs SERVICES="$(SERVICES)"

down:
	$(TOOLS) compose-down
