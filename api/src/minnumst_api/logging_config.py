import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime

from minnumst_api.config import LogLevel

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)


class JsonFormatter(logging.Formatter):
    reserved = set(logging.makeLogRecord({}).__dict__) | {"asctime", "message"}

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            request_id = request_id_context.get()
            if request_id:
                record.request_id = request_id
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "service": "minnumst-api",
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(
            {
                key: value
                for key, value in record.__dict__.items()
                if key not in self.reserved and key not in {"service", "color_message"}
            }
        )
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: LogLevel) -> None:
    numeric_level = logging.getLevelNamesMapping()[level]
    root = logging.getLogger()
    root.setLevel(numeric_level)
    handler = next(
        (item for item in root.handlers if getattr(item, "_minnumst_json", False)),
        None,
    )
    if handler is None:
        handler = logging.StreamHandler()
        handler._minnumst_json = True
        root.addHandler(handler)
    handler.setLevel(numeric_level)
    handler.setFormatter(JsonFormatter())

    for logger_name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(logger_name)
        server_logger.handlers.clear()
        server_logger.propagate = True
        server_logger.setLevel(numeric_level)

    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False
    access_logger.setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
