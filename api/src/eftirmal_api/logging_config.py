import logging

from eftirmal_api.config import LogLevel

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging(level: LogLevel) -> None:
    numeric_level = logging.getLevelNamesMapping()[level]
    logging.basicConfig(level=numeric_level, format=LOG_FORMAT)
    logging.getLogger().setLevel(numeric_level)

    for logger_name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(logger_name).setLevel(numeric_level)

    for logger_name in ("uvicorn.access", "httpx"):
        logging.getLogger(logger_name).setLevel(logging.WARNING)
