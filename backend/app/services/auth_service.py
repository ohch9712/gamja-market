from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import DUMMY_PASSWORD_HASH, hash_password, hash_token, new_session_token, verify_password
from app.db.models import User
from app.repositories import session_repository, user_repository


def _email_already_exists() -> AppError:
    return AppError(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.")


def _unauthenticated() -> AppError:
    return AppError(401, "UNAUTHENTICATED", "로그인이 필요합니다.")


def _issue_session(db: Session, user: User) -> str:
    token = new_session_token()
    expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().session_ttl_seconds)
    session_repository.create(db, user.id, hash_token(token), expires_at)
    return token


def signup(db: Session, email: str, password: str) -> tuple[User, str]:
    if user_repository.get_by_email(db, email) is not None:
        raise _email_already_exists()
    try:
        user = user_repository.create(db, email, hash_password(password))
        token = _issue_session(db, user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # 사전 조회를 통과한 동시 가입도 DB UNIQUE 제약으로 같은 409를 반환한다.
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "uq_users_email":
            raise _email_already_exists() from exc
        raise
    return user, token


def login(db: Session, email: str, password: str) -> tuple[User, str]:
    user = user_repository.get_by_email(db, email)
    password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    password_valid = verify_password(password, password_hash)
    if user is None or not password_valid:
        raise AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.")
    token = _issue_session(db, user)
    db.commit()
    return user, token


def logout(db: Session, token: str | None) -> None:
    if token is not None:
        session_repository.delete_by_token_hash(db, hash_token(token))
        db.commit()


def get_current_user(db: Session, token: str | None) -> User:
    if token is None:
        raise _unauthenticated()
    token_hash = hash_token(token)
    session = session_repository.get_by_token_hash(db, token_hash)
    if session is None:
        raise _unauthenticated()
    if session.expires_at <= datetime.now(UTC):
        session_repository.delete_by_token_hash(db, token_hash)
        db.commit()
        raise _unauthenticated()
    user = user_repository.get_by_id(db, session.user_id)
    if user is None:
        raise _unauthenticated()
    return user
