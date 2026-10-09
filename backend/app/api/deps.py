from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import User
from app.db.session import SessionLocal
from app.services import auth_service


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


DBSession = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, db: DBSession) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    return auth_service.get_current_user(db, token)


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_json(request: Request) -> None:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise RequestValidationError([
            {"type": "json_invalid", "loc": ("body",), "msg": "JSON 본문이 필요합니다.", "input": None},
        ])
