.DEFAULT_GOAL := help

# The only Makefile in the repository. Python tooling runs in the uv workspace
# (pyproject.toml, uv.lock, .venv) and Node tooling in the npm workspace
# (package.json, package-lock.json, node_modules).

UV_RUN := uv run --locked --all-packages
COMPOSE := bash tools/scripts/compose.sh
INVENTORY ?= deploy/inventory/hosts.ini
VAULT_ARGS ?= --ask-vault-pass

# Use the workspace's .venv even when another virtual environment is active.
unexport VIRTUAL_ENV

.PHONY: help install format format-check lint test test-api test-postgres test-frontends \
	openapi openapi-check migration build validate clean ci \
	dev-api dev-web dev-admin \
	stack-config up wait seed e2e edge backup-test browser stack-test ps logs down db-update db-clear db-reset \
	deploy-check deploy release

help:
	@printf '%s\n' \
	  'Setup and checks' \
	  '  install         Install the locked Python and Node dependencies' \
	  '  format          Format all code (Ruff, Prettier)' \
	  '  format-check    Check formatting without changing files' \
	  '  lint            Ruff, ESLint, ShellCheck, zizmor (workflow security), ansible-lint, playbook syntax, old-name guard' \
	  '  test            API tests on SQLite and the frontend tests' \
	  '  test-postgres    API tests against PostgreSQL in a container (needs Docker)' \
	  '  openapi         Regenerate api/openapi.json and the TypeScript types generated from it' \
	  '  openapi-check   Fail if the spec or the generated types are out of date' \
	  '  migration       Generate a database migration from the models (MESSAGE="…")' \
	  '  build           Build the API wheel and both frontends' \
	  '  validate        All of the above, as CI runs it (needs Docker)' \
	  '  clean           Remove build and test output' \
	  '' \
	  'Development servers (run each in its own terminal; settings via environment variables or a .env file)' \
	  '  dev-api         API with reload on http://127.0.0.1:8000 (docs at /docs)' \
	  '  dev-web         Public archive on http://127.0.0.1:5173' \
	  '  dev-admin       Editorial desk on http://127.0.0.1:5174' \
	  '' \
	  'Local stack: the deploy/ Compose template with locally built images' \
	  '  stack-test      up, wait, seed, e2e, edge, backup-test and browser in order' \
	  '  up              Build the images and start the stack, Traefik included' \
	  '  wait            Wait until the API is ready and both frontends serve' \
	  '  seed            Add fictional sample people and stories (idempotent)' \
	  '  e2e             Run the end-to-end API tests against the stack' \
	  '  edge            Test the edge through Traefik: TLS redirect, headers, auth on writes, rate limit, isolation' \
	  '  backup-test     Back up the database and restore it into a scratch database' \
	  '  browser         Playwright tests of both frontends, with CSP and accessibility checks' \
	  '  ps, logs, down  Status, logs (SERVICES="api public") and stop (keeps data)' \
	  '  stack-config    Render and validate the Compose configuration' \
	  '  db-update       Append revisions when the sample stories change' \
	  '  db-clear        Delete all local data (asks for confirmation)' \
	  '  db-reset        Delete all local data and reseed (asks for confirmation)' \
	  '' \
	  'Releases' \
	  '  release         Version, changelog, commit and tag one component; never pushes' \
	  '                  COMPONENT=api|web|admin|deploy [INCREMENT=MAJOR|MINOR|PATCH] [DRY_RUN=1]' \
	  '' \
	  'Deployment' \
	  '  deploy-check    ansible-lint and playbook syntax check' \
	  '  deploy          Harden the host and deploy to INVENTORY (asks for the vault password; ARGS="--tags host" for one part)' \
	  '' \
	  '  ci              validate, then stack-test'

install:
	uv sync --locked --all-packages --all-groups
	npm ci

format:
	$(UV_RUN) ruff format .
	$(UV_RUN) ruff check --fix --select I .
	npm run format

format-check:
	$(UV_RUN) ruff format --check .
	npm run format:check

lint: deploy-check
	$(UV_RUN) ruff check .
	npm run lint
	$(UV_RUN) shellcheck tools/scripts/*.sh deploy/roles/*/files/*.sh
	$(UV_RUN) zizmor --offline .github
	@# The bracket keeps this line from matching itself.
	@if git grep -n -I -i 'eftir[m]' -- ':!*CHANGELOG.md' ':!README.md' ':!TODO.md'; then \
	  echo "The project's former name belongs only in changelogs, the README History and TODO."; exit 1; fi

test: test-api test-frontends

test-api:
	$(UV_RUN) pytest api/tests --cov

test-postgres:
	RUN_POSTGRES_TESTS=1 $(UV_RUN) pytest api/tests/test_postgres.py

test-frontends:
	npm test -- --coverage

openapi:
	$(UV_RUN) python api/scripts/generate_openapi.py
	npm run --silent openapi:types

openapi-check:
	$(UV_RUN) python api/scripts/generate_openapi.py --check
	npm run --silent openapi:types -- --check

migration:
	@test -n "$(MESSAGE)" || { echo 'Usage: make migration MESSAGE="describe the change"'; exit 2; }
	cd api && $(UV_RUN) python -m minnumst_api.migrate revision "$(MESSAGE)"

build:
	uv build --package minnumst-api --out-dir api/dist
	npm run build

validate: format-check lint openapi-check test test-postgres build

clean:
	rm -rf api/dist web/dist admin/dist coverage .pytest_cache
	find api tools -type d -name __pycache__ -prune -exec rm -rf {} +

ci:
	$(MAKE) validate
	$(MAKE) stack-test

dev-api:
	cd api && $(UV_RUN) python -m minnumst_api.migrate
	cd api && CORS_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:5174 $(UV_RUN) uvicorn minnumst_api.main:app --app-dir src --reload --host 127.0.0.1 --port 8000

dev-web:
	npm run dev --workspace web -- --host 127.0.0.1 --port 5173 --strictPort

dev-admin:
	npm run dev --workspace admin -- --host 127.0.0.1 --port 5174 --strictPort

stack-config:
	$(COMPOSE) config

up:
	$(COMPOSE) up

wait:
	$(COMPOSE) wait

seed:
	$(COMPOSE) seed

e2e:
	$(COMPOSE) e2e

edge:
	$(COMPOSE) edge

backup-test:
	$(COMPOSE) backup-test

browser:
	npx playwright test --config tools/browser/playwright.config.ts

stack-test:
	$(MAKE) up
	$(MAKE) wait
	$(MAKE) seed
	$(MAKE) e2e
	$(MAKE) edge
	$(MAKE) backup-test
	$(MAKE) browser

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs $(SERVICES)

down:
	$(COMPOSE) down

db-update:
	$(COMPOSE) update

db-clear:
	$(COMPOSE) clear

db-reset:
	$(COMPOSE) reset

deploy-check:
	cd deploy && $(UV_RUN) ansible-lint
	cd deploy && $(UV_RUN) ansible-playbook -i inventory/hosts.ini.example site.yml --syntax-check

deploy:
	cd deploy && $(UV_RUN) ansible-playbook -i $(abspath $(INVENTORY)) $(VAULT_ARGS) site.yml $(ARGS)

release:
	@test -n "$(COMPONENT)" || { echo 'Usage: make release COMPONENT=api|web|admin|deploy [INCREMENT=…] [DRY_RUN=1]'; exit 2; }
	$(UV_RUN) python tools/scripts/release.py bump $(COMPONENT) $(if $(INCREMENT),--increment $(INCREMENT)) $(if $(DRY_RUN),--dry-run)
