from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class Settings(BaseSettings):
    database_url: str = "sqlite:///./minnumst.db"
    cors_origins: str = ""
    log_level: LogLevel = "INFO"
    # PostgreSQL role the API connects as; migrations grant it only what it needs.
    database_runtime_role: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


settings = Settings()
