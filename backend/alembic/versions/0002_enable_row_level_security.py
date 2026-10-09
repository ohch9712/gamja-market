"""Supabase Data API 노출을 막기 위해 RLS 활성화.

정책은 만들지 않는다. anon/authenticated 역할의 접근은 모두 막히고,
테이블 소유자인 백엔드 접속 계정은 RLS를 우회하므로 앱 동작은 그대로다.

Revision ID: 0002_enable_row_level_security
Revises: 0001_create_users_and_sessions
"""

from alembic import op


revision = "0002_enable_row_level_security"
down_revision = "0001_create_users_and_sessions"
branch_labels = None
depends_on = None

TABLES = ("alembic_version", "users", "sessions")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
