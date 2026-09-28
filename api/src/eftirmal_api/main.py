import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from eftirmal_api.api import router
from eftirmal_api.config import settings
from eftirmal_api.database import make_engine, make_session_factory
from eftirmal_api.logging_config import configure_logging
from eftirmal_api.models import Base

logger = logging.getLogger(__name__)


def create_app(database_url: str | None = None, create_tables: bool = True) -> FastAPI:
    configure_logging(settings.log_level)
    engine = make_engine(database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("Starting Eftirmal API")
        if create_tables:
            try:
                Base.metadata.create_all(engine)
            except SQLAlchemyError:
                logger.exception("Database schema initialization failed")
                engine.dispose()
                raise
            logger.info("Database schema is ready")
        try:
            yield
        finally:
            engine.dispose()
            logger.info("Stopped Eftirmal API")

    app = FastAPI(title="Eftirmal API", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.include_router(router)

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        started_at = perf_counter()
        logger.debug("Request started method=%s", request.method)
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("Request failed method=%s", request.method)
            raise

        route = request.scope.get("route")
        route_path = getattr(route, "path", "<unmatched>")
        duration_ms = (perf_counter() - started_at) * 1000
        if response.status_code >= 500:
            log_method = logger.error
        elif response.status_code >= 400:
            log_method = logger.warning
        else:
            log_method = logger.info
        log_method(
            "Request completed method=%s route=%s status_code=%d duration_ms=%.2f",
            request.method,
            route_path,
            response.status_code,
            duration_ms,
        )
        return response

    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

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
