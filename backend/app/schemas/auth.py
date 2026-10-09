from datetime import UTC, datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import EmailStr, Field, field_serializer, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: Annotated[EmailStr, Field(min_length=1, max_length=254)]
    password: Annotated[str, Field(strict=True, min_length=8, max_length=128)]

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> str:
        if not isinstance(value, str):
            raise PydanticCustomError("email_invalid", "올바른 이메일 형식이 아닙니다.")
        normalized = value.strip().lower()
        if not 1 <= len(normalized) <= 254:
            raise PydanticCustomError("email_invalid", "올바른 이메일 형식이 아닙니다.")
        return normalized


class SignupRequest(LoginRequest):
    password_confirm: Annotated[str, Field(strict=True)]

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        # after 검증은 password의 길이 검증이 통과한 경우에만 실행된다.
        if not self.password_confirm:
            raise PydanticCustomError("password_confirmation", "비밀번호를 한 번 더 입력해 주세요.")
        if self.password != self.password_confirm:
            raise PydanticCustomError("password_confirmation", "비밀번호가 일치하지 않습니다.")
        return self


class UserOut(CamelModel):
    id: UUID
    email: str
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class AuthResponse(CamelModel):
    user: UserOut
