import json
import logging

import pytest
from pydantic import ValidationError

from eftirmal_api.config import Settings
from eftirmal_api.logging_config import JsonFormatter, configure_logging


def test_log_level_defaults_to_info(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    assert Settings(_env_file=None).log_level == "INFO"


@pytest.mark.parametrize("level", ["DEBUG", "INFO", "WARNING", "ERROR"])
def test_log_level_reads_allowed_value_from_env_file(tmp_path, level: str) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(f"LOG_LEVEL={level}\n", encoding="utf-8")

    assert Settings(_env_file=env_file).log_level == level


def test_invalid_log_level_is_rejected(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("LOG_LEVEL=TRACE\n", encoding="utf-8")

    with pytest.raises(ValidationError):
        Settings(_env_file=env_file)


def test_configure_logging_sets_application_and_server_levels() -> None:
    configure_logging("DEBUG")

    assert logging.getLogger().level == logging.DEBUG
    assert logging.getLogger("eftirmal_api").getEffectiveLevel() == logging.DEBUG
    assert logging.getLogger("uvicorn.error").level == logging.DEBUG
    assert logging.getLogger("uvicorn.access").level == logging.WARNING
    assert logging.getLogger("httpx").level == logging.WARNING

    configure_logging("INFO")


def test_json_formatter_includes_trace_fields() -> None:
    record = logging.LogRecord(
        "eftirmal_api.main",
        logging.INFO,
        __file__,
        1,
        "Request completed",
        (),
        None,
    )
    record.request_id = "request-123"
    record.route = "/api/people/{person_id}"
    record.status_code = 200

    payload = json.loads(JsonFormatter().format(record))

    assert payload["service"] == "eftirmal-api"
    assert payload["level"] == "INFO"
    assert payload["request_id"] == "request-123"
    assert payload["route"] == "/api/people/{person_id}"
    assert payload["status_code"] == 200
