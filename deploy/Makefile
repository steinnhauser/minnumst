UV ?= uv
VAULT_ARGS ?= --ask-vault-pass
INVENTORY ?= inventory/hosts.ini
SYNTAX_INVENTORY ?= inventory/hosts.ini.example

.PHONY: install format format-check lint syntax-check check deploy

install:
	$(UV) sync --locked

format:
	$(UV) run ruff format .

format-check:
	$(UV) run ruff format --check .

lint:
	$(UV) run ruff check .
	$(UV) run ansible-lint

syntax-check:
	$(UV) run ansible-playbook -i $(SYNTAX_INVENTORY) site.yml --syntax-check

check: format-check lint

validate: check syntax-check

deploy:
	$(UV) run ansible-playbook -i $(INVENTORY) $(VAULT_ARGS) site.yml