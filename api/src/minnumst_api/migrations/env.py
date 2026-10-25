from alembic import context

from minnumst_api.models import Base

engine = context.config.attributes["engine"]
with engine.begin() as connection:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        # SQLite can't alter tables in place; Alembic recreates them instead.
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()
