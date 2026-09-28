.DEFAULT_GOAL := help

DEV_HOST ?= 127.0.0.1
DEV_PORT ?= 5173
DEV_PID_FILE := .dev-server.pid
DEV_LOG_FILE := .dev-server.log

.PHONY: help install format format-check lint test test-watch validate build dev-start dev-stop run-dev preview clean

help:
	@printf '%s\n' \
	  'install       Install npm dependencies' \
	  'format        Format project files' \
	  'format-check  Check formatting without changing files' \
	  'lint          Run ESLint' \
	  'test          Run tests once' \
	  'test-watch    Run tests in watch mode' \
	  'validate      Run formatting, lint, tests, and production build' \
	  'build         Type-check and build for production' \
	  'dev-start     Start Vite in the background' \
	  'dev-stop      Stop the Vite process started by dev-start' \
	  'preview       Preview the production build' \
	  'clean         Remove generated build and coverage output'

install:
	npm install

format:
	npm run format

format-check:
	npm run format:check

lint:
	npm run lint

test:
	npm test

test-watch:
	npm run test:watch

validate:
	npm run validate

build:
	npm run build

dev-start:
	@set -eu; \
	if [ -f "$(DEV_PID_FILE)" ]; then \
	  pid=$$(cat "$(DEV_PID_FILE)"); \
	  process=$$(ps -p "$$pid" -o args= 2>/dev/null || true); \
	  case "$$process" in \
	    *"$(CURDIR)/node_modules/.bin/vite"*) printf 'Main dev server is already running (PID %s).\n' "$$pid"; exit 0 ;; \
	  esac; \
	  rm -f "$(DEV_PID_FILE)"; \
	fi; \
	"$(CURDIR)/node_modules/.bin/vite" --host "$(DEV_HOST)" --port "$(DEV_PORT)" --strictPort >"$(DEV_LOG_FILE)" 2>&1 & \
	pid=$$!; \
	printf '%s\n' "$$pid" > "$(DEV_PID_FILE)"; \
	printf 'Main dev server started at http://%s:%s/ (PID %s).\n' "$(DEV_HOST)" "$(DEV_PORT)" "$$pid"; \
	printf 'Server output: %s\n' "$(DEV_LOG_FILE)"

dev-stop:
	@set -eu; \
	if [ ! -f "$(DEV_PID_FILE)" ]; then printf 'No main dev server is tracked by Make.\n'; exit 0; fi; \
	pid=$$(cat "$(DEV_PID_FILE)"); \
	case "$$pid" in ''|*[!0-9]*) printf 'Invalid PID in %s; refusing to signal a process.\n' "$(DEV_PID_FILE)" >&2; exit 1 ;; esac; \
	process=$$(ps -p "$$pid" -o args= 2>/dev/null || true); \
	case "$$process" in \
	  *"$(CURDIR)/node_modules/.bin/vite"*) kill -TERM "$$pid"; rm -f "$(DEV_PID_FILE)"; printf 'Stopped main dev server (PID %s).\n' "$$pid" ;; \
	  *) rm -f "$(DEV_PID_FILE)"; printf 'Removed stale dev-server PID file; no matching Vite process was running.\n' ;; \
	esac

run-dev: dev-start

preview:
	npm run preview

clean:
	rm -rf dist coverage
