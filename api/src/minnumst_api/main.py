import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import version
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from minnumst_api.api import router
from minnumst_api.config import settings
from minnumst_api.database import make_engine, make_session_factory
from minnumst_api.logging_config import configure_logging, request_id_context

logger = logging.getLogger(__name__)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        supplied_request_id = headers.get(b"x-request-id", b"").decode("latin-1")
        request_id = (
            supplied_request_id
            if REQUEST_ID_PATTERN.fullmatch(supplied_request_id)
            else str(uuid4())
        )
        scope.setdefault("state", {})["request_id"] = request_id
        context_token = request_id_context.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = list(message.get("headers", []))
                if not any(
                    key.lower() == b"x-request-id" for key, _ in response_headers
                ):
                    response_headers.append(
                        (b"x-request-id", request_id.encode("ascii"))
                    )
                message = {**message, "headers": response_headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_context.reset(context_token)


async def internal_server_error(request: Request, _: Exception) -> ASGIApp:
    """Answer an unhandled exception with a generic body and the request's ID.

    Starlette's ServerErrorMiddleware calls this from outside
    RequestContextMiddleware and CORSMiddleware, so the header is set here and
    the response goes through the app's own CORS settings, letting an allowed
    origin read the status and request ID. The exception itself has already
    been logged as "Request failed" and its details never reach the client.
    """
    response = JSONResponse(
        {"detail": "Internal Server Error"},
        status_code=500,
        headers={"X-Request-ID": request.state.request_id},
    )
    cors_options = request.app.state.cors_options
    return CORSMiddleware(response, **cors_options) if cors_options else response


def create_app(database_url: str | None = None) -> FastAPI:
    """The API. Its schema comes from migrations (`python -m minnumst_api.migrate`)."""
    configure_logging(settings.log_level)
    engine = make_engine(database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("Starting Minnumst API")
        try:
            yield
        finally:
            engine.dispose()
            logger.info("Stopped Minnumst API")

    app = FastAPI(
        title="Minnumst API",
        version=version("minnumst-api"),
        lifespan=lifespan,
        exception_handlers={Exception: internal_server_error},
    )
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.include_router(router)

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        request_id = request.state.request_id
        started_at = perf_counter()
        logger.debug(
            "Request started",
            extra={"request_id": request_id, "method": request.method},
        )
        try:
            response = await call_next(request)
        except Exception:
            route = getattr(request.scope.get("route"), "path", "<unmatched>")
            logger.exception(
                "Request failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route": route,
                },
            )
            raise

        route = request.scope.get("route")
        route_path = getattr(route, "path", "<unmatched>")
        duration_ms = (perf_counter() - started_at) * 1000
        if response.status_code >= 500:
            log_method = logger.error
        elif response.status_code >= 400:
            log_method = logger.warning
        elif route_path in {"/healthz", "/readyz"}:
            log_method = logger.debug
        else:
            log_method = logger.info
        response.headers["X-Request-ID"] = request_id
        log_method(
            "Request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "route": route_path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        return response

    # Explicit origins only; credentials carry the Authentik session cookie
    # from the admin desk to the API's hostname. internal_server_error reuses
    # these settings for responses built outside the middleware.
    app.state.cors_options = (
        {
            "allow_origins": settings.allowed_origins,
            "allow_credentials": True,
            "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE"],
            "allow_headers": ["Authorization", "Content-Type", "X-Request-ID"],
            "expose_headers": ["X-Request-ID"],
        }
        if settings.allowed_origins
        else None
    )
    if app.state.cors_options:
        app.add_middleware(CORSMiddleware, **app.state.cors_options)

    app.add_middleware(RequestContextMiddleware)

    @app.get("/healthz", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", tags=["health"])
    def ready() -> dict[str, str]:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        logger.debug("Database readiness check succeeded")
        return {"status": "ready"}

    return app


app = create_app()
