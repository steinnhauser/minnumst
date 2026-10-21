.DEFAULT_GOAL := help

UV ?= uv
DEV_HOST ?= 127.0.0.1
DEV_PORT ?= 8000
DEV_PID_FILE := .dev-server.pid
DEV_LOG_FILE := .dev-server.log

.PHONY: help install format format-check lint test test-mariadb generate-openapi check-openapi validate build dev-start run-dev dev-stop stop clean

help:
	@printf '%s\n' \
	  'install       Install project and development dependencies with uv' \
	  'format        Format Python files with Ruff' \
	  'format-check  Check formatting without changing files' \
	  'lint          Run Ruff lint checks' \
	  'test          Run the fast SQLite-backed test suite' \
	  'test-mariadb  Run the MariaDB Testcontainers integration suite' \
	  'generate-openapi Generate api/openapi.json' \
	  'check-openapi  Check the spec without writing files' \
	  'validate      Run all checks, tests, and the build' \
	  'build         Build source and wheel distributions' \
	  'dev-start     Start the reload-enabled API server in the background' \
	  'dev-stop      Stop the API server started by dev-start' \
	  'clean         Remove generated files and the virtual environment'

install:
	$(UV) sync --all-groups

format:
	$(UV) run ruff format .

format-check:
	$(UV) run ruff format --check .

lint:
	$(UV) run ruff check .

test:
	$(UV) run python -m pytest

test-mariadb:
	RUN_MARIADB_TESTS=1 $(UV) run python -m pytest tests/test_mariadb.py

generate-openapi:
	$(UV) run python scripts/generate_openapi.py

check-openapi:
	$(UV) run python scripts/generate_openapi.py --check

validate: format-check lint check-openapi test test-mariadb build

build:
	$(UV) build

dev-start:
	@set -eu; \
	if [ -f "$(DEV_PID_FILE)" ]; then \
	  pid=$$(cat "$(DEV_PID_FILE)"); \
	  process=$$(ps -p "$$pid" -o args= 2>/dev/null || true); \
	  case "$$process" in \
	    *"uvicorn minnumst_api.main:app"*) printf 'API dev server is already running (PID %s).\n' "$$pid"; exit 0 ;; \
	  esac; \
	  rm -f "$(DEV_PID_FILE)"; \
	fi; \
	$(UV) run --no-sync python -m uvicorn minnumst_api.main:app --app-dir src --reload --host "$(DEV_HOST)" --port "$(DEV_PORT)" >"$(DEV_LOG_FILE)" 2>&1 & \
	pid=$$!; \
	printf '%s\n' "$$pid" > "$(DEV_PID_FILE)"; \
	printf 'API dev server started at http://%s:%s/ (PID %s).\n' "$(DEV_HOST)" "$(DEV_PORT)" "$$pid"; \
	printf 'Server output: %s\n' "$(DEV_LOG_FILE)"

run-dev: dev-start

dev-stop:
	@set -eu; \
	if [ ! -f "$(DEV_PID_FILE)" ]; then printf 'No API dev server is tracked by Make.\n'; exit 0; fi; \
	pid=$$(cat "$(DEV_PID_FILE)"); \
	case "$$pid" in ''|*[!0-9]*) printf 'Invalid PID in %s; refusing to signal a process.\n' "$(DEV_PID_FILE)" >&2; exit 1 ;; esac; \
	process=$$(ps -p "$$pid" -o args= 2>/dev/null || true); \
	case "$$process" in \
	  *"uvicorn minnumst_api.main:app"*) kill -TERM "$$pid"; rm -f "$(DEV_PID_FILE)"; printf 'Stopped API dev server (PID %s).\n' "$$pid" ;; \
	  *) rm -f "$(DEV_PID_FILE)"; printf 'Removed stale dev-server PID file; no matching Uvicorn process was running.\n' ;; \
	esac

stop: dev-stop

clean:
	rm -rf .venv .pytest_cache .ruff_cache build dist
	find src tests -type d -name __pycache__ -prune -exec rm -rf {} +