from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_preflight(client: TestClient) -> None:
    response = client.options(
        "/api/auth/signup",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_disallows_other_origins(client: TestClient) -> None:
    response = client.options(
        "/api/auth/signup",
        headers={"Origin": "http://other.example.com", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "HTTP_ERROR"
    assert response.json()["error"]["details"] == []
    assert "access-control-allow-origin" not in response.headers


def test_not_found_has_common_error_format(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "요청한 경로를 찾을 수 없습니다.", "details": []},
    }


def test_method_not_allowed_has_common_error_format(client: TestClient) -> None:
    response = client.post("/api/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert response.json()["error"]["details"] == []


def test_fastapi_http_exception_has_common_error_format(app: FastAPI, client: TestClient) -> None:
    @app.get("/api/test-http-exception")
    def http_exception() -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    response = client.get("/api/test-http-exception")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_internal_error_has_common_error_format(app: FastAPI, client: TestClient) -> None:
    @app.get("/api/test-error")
    def internal_error() -> None:
        raise RuntimeError("응답에 노출되면 안 되는 내부 정보")

    response = client.get("/api/test-error", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            "details": [],
        },
    }
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
