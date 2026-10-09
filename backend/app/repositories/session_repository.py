from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession

from app.db.models import Session


def create(db: DBSession, user_id: UUID, token_hash: str, expires_at: datetime) -> Session:
    session = Session(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(session)
    db.flush()
    return session


def get_by_token_hash(db: DBSession, token_hash: str) -> Session | None:
    return db.scalar(select(Session).where(Session.token_hash == token_hash))


def delete_by_token_hash(db: DBSession, token_hash: str) -> None:
    db.execute(delete(Session).where(Session.token_hash == token_hash))
