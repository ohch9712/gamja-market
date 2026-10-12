from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.api.deps import get_db
from app.core.config import Settings
from app.db.session import create_db_engine
from app.main import create_app


class ExplodingSession:
    """속성에 접근하는 순간 실패하는 가짜 DB 세션. DB를 건드리지 않는 경로를 검증한다."""

    def __getattr__(self, name: str) -> None:
        raise AssertionError(f"DB에 접근하면 안 됩니다: {name}")


@pytest.fixture
def dbless_client() -> Iterator[TestClient]:
    application = create_app()

    def override_get_db() -> Iterator[ExplodingSession]:
        yield ExplodingSession()

    application.dependency_overrides[get_db] = override_get_db
    with TestClient(application, raise_server_exceptions=False) as test_client:
        yield test_client


def test_me_without_cookie_returns_401_without_db(dbless_client: TestClient) -> None:
    # 비로그인 방문자의 헤더 상태 확인은 DB 지연·장애와 무관하게 즉시 끝나야 한다.
    response = dbless_client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_health_does_not_use_db(dbless_client: TestClient) -> None:
    response = dbless_client.get("/api/health")
    assert response.status_code == 200


class StopConnect(Exception):
    pass


def test_engine_passes_connect_timeout_to_driver() -> None:
    settings = Settings(database_url="postgresql+psycopg://gamja:secret@db.invalid:5432/gamja", db_connect_timeout_seconds=3)
    engine = create_db_engine(settings)
    captured: dict[str, object] = {}

    @event.listens_for(engine, "do_connect")
    def capture(dialect, connection_record, cargs, cparams) -> None:
        captured.update(cparams)
        raise StopConnect

    try:
        with pytest.raises(StopConnect):
            engine.connect()
    finally:
        engine.dispose()
    assert captured["connect_timeout"] == 3


def test_connect_timeout_defaults_to_five_seconds() -> None:
    assert Settings(_env_file=None).db_connect_timeout_seconds == 5
