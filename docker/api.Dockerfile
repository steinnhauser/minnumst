# Build from the repository root: docker build -f docker/api.Dockerfile .
FROM python:3.13-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.22 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Workspace manifests first, so the dependency layer is cached across source changes.
COPY pyproject.toml uv.lock .python-version ./
COPY api/pyproject.toml api/README.md api/
COPY deploy/pyproject.toml deploy/
RUN uv sync --locked --no-dev --package minnumst-api --no-install-workspace

COPY api/src/ api/src/
RUN uv sync --locked --no-dev --package minnumst-api --no-editable

FROM python:3.13-slim-bookworm

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app --uid 10001 --create-home app

COPY --from=builder --chown=app:app /app/.venv /app/.venv

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"]

CMD ["uvicorn", "minnumst_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
