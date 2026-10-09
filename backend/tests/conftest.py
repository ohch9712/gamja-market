from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.db.models import Session as AuthSession
from app.db.models import User
from app.main import create_app


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db(test_engine: Engine) -> Iterator[Session]:
    with test_engine.connect() as connection:
        transaction = connection.begin()
        # 개발 DB를 함께 쓰므로 기존 행은 이 트랜잭션 안에서만 비우고, 종료 시 롤백으로 복원한다.
        connection.execute(delete(AuthSession))
        connection.execute(delete(User))
        with Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False) as session:
            try:
                yield session
            finally:
                session.close()
                transaction.rollback()


@pytest.fixture
def app(db: Session) -> Iterator[FastAPI]:
    application = create_app()

    def override_get_db() -> Iterator[Session]:
        yield db

    application.dependency_overrides[get_db] = override_get_db
    try:
        yield application
    finally:
        application.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
