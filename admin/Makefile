.DEFAULT_GOAL := help

.PHONY: help install format format-check lint test test-watch build run-dev preview clean

help:
	@printf '%s\n' \
	  'install       Install npm dependencies' \
	  'format        Format project files' \
	  'format-check  Check formatting without changing files' \
	  'lint          Run ESLint' \
	  'test          Run tests once' \
	  'test-watch    Run tests in watch mode' \
	  'build         Type-check and build for production' \
	  'run-dev       Start the Vite development server' \
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

build:
	npm run build

run-dev:
	npm run dev

preview:
	npm run preview

clean:
	rm -rf dist coverage
