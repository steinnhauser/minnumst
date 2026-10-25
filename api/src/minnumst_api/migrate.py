"""Database migrations.

    python -m minnumst_api.migrate                     apply all migrations
    python -m minnumst_api.migrate downgrade REVISION   roll the schema back
    python -m minnumst_api.migrate revision "message"  generate a new migration

Migrations run with a role that owns the schema. They grant the API's runtime
role (DATABASE_RUNTIME_ROLE) only the privileges it needs, so the API itself
can't change the schema or rewrite story revisions.
"""

import argparse
import logging
from pathlib import Path
from tempfile import TemporaryDirectory

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

from minnumst_api.config import settings
from minnumst_api.database import make_engine
from minnumst_api.logging_config import configure_logging

MIGRATIONS = Path(__file__).with_name("migrations")
logger = logging.getLogger(__name__)


def _config(engine: Engine) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    config.attributes["engine"] = engine
    return config


def upgrade(engine: Engine, revision: str = "head") -> None:
    command.upgrade(_config(engine), revision)


def downgrade(engine: Engine, revision: str = "base") -> None:
    command.downgrade(_config(engine), revision)


def revision(message: str) -> None:
    """Write a migration for the difference between the models and head."""
    with TemporaryDirectory() as directory:
        engine = make_engine(f"sqlite:///{directory}/scratch.db")
        upgrade(engine)
        command.revision(_config(engine), message=message, autogenerate=True)
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Minnumst database migrations")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("upgrade", help="apply all migrations (the default)")
    commands.add_parser("downgrade", help="roll back to a revision").add_argument(
        "revision"
    )
    commands.add_parser("revision", help="generate a migration").add_argument("message")
    args = parser.parse_args()
    configure_logging(settings.log_level)
    if args.command == "revision":
        revision(args.message)
        return
    if args.command == "downgrade":
        downgrade(make_engine(), args.revision)
        logger.info("Database schema rolled back to %s", args.revision)
        return
    upgrade(make_engine())
    logger.info("Database schema is up to date")


if __name__ == "__main__":
    main()
