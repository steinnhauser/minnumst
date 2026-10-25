# Build from the repository root: docker build -f docker/api.Dockerfile .
FROM python:3.13-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530 AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.22@sha256:f513a91fc62fe7c17567eee97230dd198e43edb8a9fbecca843714a4358fe1bc /uv /uvx /bin/

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

FROM python:3.13-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Apply OS security fixes released since the base image was built, remove pip
# (the app runs from its own virtualenv), and add an unprivileged user.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip uninstall -y pip \
    && groupadd --system app \
    && useradd --system --gid app --uid 10001 --no-create-home app

# Owned by root: the app user can run the code but not change it.
COPY --from=builder /app/.venv /app/.venv

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"]

CMD ["uvicorn", "minnumst_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
