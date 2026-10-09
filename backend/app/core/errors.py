import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException

from app.core.config import get_settings
from app.schemas.common import ErrorBody, ErrorDetail, ErrorResponse


logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: list[ErrorDetail] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message=message, details=details or []))
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True),
        headers=headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for error in exc.errors():
        location = error.get("loc", ())
        if error["type"] == "password_confirmation":
            field = "passwordConfirm"
            message = error["msg"]
        elif error["type"] == "json_invalid" or location == ("body",) or not location:
            field = "body"
            message = "올바른 JSON 본문을 입력해 주세요."
        else:
            field = to_camel(str(location[-1]))
            message = {
                "email": "올바른 이메일 형식이 아닙니다.",
                "password": "비밀번호는 8~128자로 입력해 주세요.",
                "passwordConfirm": "비밀번호를 한 번 더 입력해 주세요.",
            }.get(field, error["msg"])
        details.append(ErrorDetail(field=field, message=message))
    return error_response(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.", details)


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code, message = {
        404: ("NOT_FOUND", "요청한 경로를 찾을 수 없습니다."),
        405: ("METHOD_NOT_ALLOWED", "허용되지 않은 요청 방식입니다."),
        500: ("INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."),
    }.get(exc.status_code, ("HTTP_ERROR", str(exc.detail)))
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("처리되지 않은 서버 오류", exc_info=(type(exc), exc, exc.__traceback__))
    response = error_response(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    # Starlette의 최상위 500 핸들러는 CORS 미들웨어 바깥에서 응답을 만든다.
    origin = request.headers.get("origin")
    if origin == get_settings().frontend_origin:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
        response.headers.add_vary_header("Origin")
    return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(Exception, internal_error_handler)
