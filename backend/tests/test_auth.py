from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import cookies
from app.core.config import Settings
from app.core.security import hash_token, verify_password
from app.db.models import Session as AuthSession, User
from app.repositories import user_repository


SIGNUP = {"email": "Potato@Example.com", "password": "gamja1234", "passwordConfirm": "gamja1234"}
INVALID_PASSWORD_MESSAGE = "비밀번호는 8~128자로 입력해 주세요."


def assert_validation(response, field: str, message: str | None = None) -> None:
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "입력값을 확인해 주세요."
    assert [detail["field"] for detail in error["details"]] == [field]
    if message is not None:
        assert error["details"][0]["message"] == message


def test_signup_creates_normalized_user_and_session(client: TestClient, db: Session) -> None:
    before = datetime.now(UTC)
    response = client.post("/api/auth/signup", json={**SIGNUP, "email": "  Potato@Example.COM  "})
    assert response.status_code == 201
    user = response.json()["user"]
    assert set(user) == {"id", "email", "createdAt"}
    UUID(user["id"])
    assert user["email"] == "potato@example.com"
    assert user["createdAt"].endswith("Z")
    datetime.fromisoformat(user["createdAt"])

    cookie = SimpleCookie(response.headers["set-cookie"])["gamja_session"]
    assert cookie["httponly"]
    assert cookie["samesite"].lower() == "lax"
    assert cookie["path"] == "/"
    assert cookie["max-age"] == "604800"
    assert not cookie["domain"]
    assert not cookie["secure"]

    stored_user = db.scalar(select(User))
    assert stored_user is not None
    assert stored_user.email == user["email"]
    assert stored_user.password_hash.startswith("$argon2id$")
    assert verify_password(SIGNUP["password"], stored_user.password_hash)
    assert set(User.__table__.columns.keys()) == {"id", "email", "password_hash", "created_at", "updated_at"}
    assert SIGNUP["passwordConfirm"] not in [getattr(stored_user, column.name) for column in User.__table__.columns]
    session = db.scalar(select(AuthSession))
    assert session is not None
    assert session.user_id == stored_user.id
    assert session.token_hash == hash_token(cookie.value)
    assert session.token_hash != cookie.value
    assert len(session.token_hash) == 64
    assert before + timedelta(days=7) <= session.expires_at <= datetime.now(UTC) + timedelta(days=7)
    assert client.get("/api/auth/me").json() == response.json()


def test_signup_duplicate_normalized_email(client: TestClient, db: Session) -> None:
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
    response = client.post("/api/auth/signup", json={**SIGNUP, "email": " potato@example.com "})
    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "EMAIL_ALREADY_EXISTS", "message": "이미 가입된 이메일입니다.", "details": []},
    }
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 1


def test_signup_unique_constraint_race_returns_409(client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
    monkeypatch.setattr(user_repository, "get_by_email", lambda db, email: None)
    response = client.post("/api/auth/signup", json=SIGNUP)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 1


@pytest.mark.parametrize("email", ["not-an-email", "", "a" * 255 + "@example.com", None, 123])
def test_signup_invalid_email(client: TestClient, db: Session, email: object) -> None:
    response = client.post("/api/auth/signup", json={**SIGNUP, "email": email})
    assert_validation(response, "email", "올바른 이메일 형식이 아닙니다.")
    assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("password", ["x" * 7, "x" * 129, "", None, 12345678])
def test_signup_invalid_password(client: TestClient, db: Session, password: object) -> None:
    response = client.post("/api/auth/signup", json={**SIGNUP, "password": password, "passwordConfirm": "different"})
    assert_validation(response, "password", INVALID_PASSWORD_MESSAGE)
    assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("password", ["x" * 8, "x" * 128, " 비밀번호 123 ", "감" * 128])
def test_signup_password_boundaries_and_whitespace(client: TestClient, password: str) -> None:
    response = client.post("/api/auth/signup", json={**SIGNUP, "password": password, "passwordConfirm": password})
    assert response.status_code == 201
    assert client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": password}).status_code == 200


@pytest.mark.parametrize("confirmation", ["gamja1235", "Gamja1234", "gamja1234 "])
def test_signup_password_confirmation_mismatch(client: TestClient, db: Session, confirmation: str) -> None:
    response = client.post("/api/auth/signup", json={**SIGNUP, "passwordConfirm": confirmation})
    assert_validation(response, "passwordConfirm", "비밀번호가 일치하지 않습니다.")
    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


def test_signup_password_confirmation_missing(client: TestClient, db: Session) -> None:
    payload = {key: value for key, value in SIGNUP.items() if key != "passwordConfirm"}
    response = client.post("/api/auth/signup", json=payload)
    assert_validation(response, "passwordConfirm")
    assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("confirmation", ["", None, 12345678])
def test_signup_password_confirmation_requires_string(client: TestClient, db: Session, confirmation: object) -> None:
    response = client.post("/api/auth/signup", json={**SIGNUP, "passwordConfirm": confirmation})
    assert_validation(response, "passwordConfirm", "비밀번호를 한 번 더 입력해 주세요.")
    assert db.scalar(select(func.count()).select_from(User)) == 0


def test_login_new_session_keeps_existing_session_and_ignores_confirmation(client: TestClient, db: Session) -> None:
    signup = client.post("/api/auth/signup", json=SIGNUP)
    old_token = client.cookies["gamja_session"]
    response = client.post("/api/auth/login", json={**SIGNUP, "email": " POTATO@EXAMPLE.COM ", "passwordConfirm": {"ignored": True}})
    assert response.status_code == 200
    assert response.json() == signup.json()
    new_token = client.cookies["gamja_session"]
    assert old_token != new_token
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 2
    assert client.get("/api/auth/me", headers={"Cookie": f"gamja_session={old_token}"}).status_code == 200
    assert client.get("/api/auth/me", headers={"Cookie": f"gamja_session={new_token}"}).status_code == 200


def test_login_without_password_confirmation(client: TestClient) -> None:
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
    response = client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]})
    assert response.status_code == 200
    assert "gamja_session=" in response.headers["set-cookie"]


def test_login_invalid_credentials_same_response(client: TestClient) -> None:
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
    wrong_password = client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": "incorrect123"})
    no_user = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": SIGNUP["password"]})
    assert wrong_password.status_code == no_user.status_code == 401
    assert wrong_password.json() == no_user.json() == {
        "error": {"code": "INVALID_CREDENTIALS", "message": "이메일 또는 비밀번호가 올바르지 않습니다.", "details": []},
    }
    assert "set-cookie" not in wrong_password.headers
    assert "set-cookie" not in no_user.headers


@pytest.mark.parametrize("changes,field", [({"email": "invalid"}, "email"), ({"password": "short"}, "password")])
def test_login_validation(client: TestClient, changes: dict, field: str) -> None:
    response = client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"], **changes})
    assert_validation(response, field)


def test_me_requires_cookie_and_ignores_authorization(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "UNAUTHENTICATED", "message": "로그인이 필요합니다.", "details": []}}
    client.post("/api/auth/signup", json=SIGNUP)
    token = client.cookies["gamja_session"]
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Cookie": "gamja_session=unknown-token"}).status_code == 401


def test_logout_deletes_session_and_rejects_replayed_cookie(client: TestClient, db: Session) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    token = client.cookies["gamja_session"]
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert response.content == b""
    cookie = SimpleCookie(response.headers["set-cookie"])["gamja_session"]
    assert cookie["max-age"] == "0"
    assert cookie["httponly"]
    assert cookie["path"] == "/"
    assert cookie["samesite"].lower() == "lax"
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0
    response = client.get("/api/auth/me", headers={"Cookie": f"gamja_session={token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert client.post("/api/auth/logout", headers={"Cookie": f"gamja_session={token}"}).status_code == 204
    assert client.post("/api/auth/logout").status_code == 204


def test_logout_only_deletes_current_session(client: TestClient, db: Session) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    first_token = client.cookies["gamja_session"]
    client.post("/api/auth/login", json=SIGNUP)
    second_token = client.cookies["gamja_session"]
    assert client.post("/api/auth/logout").status_code == 204
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 1
    assert client.get("/api/auth/me", headers={"Cookie": f"gamja_session={first_token}"}).status_code == 200
    assert client.get("/api/auth/me", headers={"Cookie": f"gamja_session={second_token}"}).status_code == 401


def test_expired_session_is_deleted(client: TestClient, db: Session) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    session = db.scalar(select(AuthSession))
    assert session is not None
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


def test_me_does_not_extend_session_expiry(client: TestClient, db: Session) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    session = db.scalar(select(AuthSession))
    original_expiry = session.expires_at
    assert client.get("/api/auth/me").status_code == 200
    db.refresh(session)
    assert session.expires_at == original_expiry


def test_user_deletion_cascades_sessions(client: TestClient, db: Session) -> None:
    client.post("/api/auth/signup", json=SIGNUP)
    user = db.scalar(select(User))
    db.delete(user)
    db.commit()
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


def test_cookie_secure_setting(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cookies, "get_settings", lambda: Settings(cookie_secure=True))
    response = client.post("/api/auth/signup", json=SIGNUP)
    assert response.status_code == 201
    assert SimpleCookie(response.headers["set-cookie"])["gamja_session"]["secure"]
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert SimpleCookie(response.headers["set-cookie"])["gamja_session"]["secure"]


@pytest.mark.parametrize("body", ["not-json", '{"email":', "[]", "null"])
def test_malformed_or_non_object_json(client: TestClient, body: str) -> None:
    response = client.post("/api/auth/signup", content=body, headers={"Content-Type": "application/json"})
    assert_validation(response, "body")


@pytest.mark.parametrize("content_type", [None, "text/plain", "application/x-www-form-urlencoded"])
def test_signup_requires_json_content_type(client: TestClient, content_type: str | None) -> None:
    import json

    headers = {"Content-Type": content_type} if content_type else {}
    response = client.post("/api/auth/signup", content=json.dumps(SIGNUP), headers=headers)
    assert_validation(response, "body")
