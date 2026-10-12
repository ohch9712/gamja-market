from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://gamja:gamja_local_password@localhost:5432/gamja_market"
    # Alembic 전용 접속 URL. 비어 있으면 database_url을 사용한다.
    migration_database_url: str | None = None
    # DB 접속(TCP 연결·인증) 대기 상한(초). DB가 응답하지 않아도 요청이 함수 최대 실행 시간까지 매달리지 않게 한다.
    db_connect_timeout_seconds: int = Field(default=5, gt=0)
    frontend_origin: str = "http://localhost:3000"
    session_cookie_name: str = "gamja_session"
    session_ttl_seconds: int = Field(default=604800, gt=0)
    cookie_secure: bool = False


    @property
    def alembic_database_url(self) -> str:
        return self.migration_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
