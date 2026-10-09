from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://gamja:gamja_local_password@localhost:5432/gamja_market"
    frontend_origin: str = "http://localhost:3000"
    session_cookie_name: str = "gamja_session"
    session_ttl_seconds: int = Field(default=604800, gt=0)
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
