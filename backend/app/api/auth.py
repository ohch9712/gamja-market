from fastapi import APIRouter, Depends, Request, Response, status

from app.api.deps import CurrentUser, DBSession, require_json
from app.core.config import get_settings
from app.core.cookies import clear_session_cookie, set_session_cookie
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserOut
from app.services import auth_service


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=AuthResponse, dependencies=[Depends(require_json)])
def signup(payload: SignupRequest, response: Response, db: DBSession) -> AuthResponse:
    user, token = auth_service.signup(db, str(payload.email), payload.password)
    set_session_cookie(response, token)
    return AuthResponse(user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(require_json)])
def login(payload: LoginRequest, response: Response, db: DBSession) -> AuthResponse:
    user, token = auth_service.login(db, str(payload.email), payload.password)
    set_session_cookie(response, token)
    return AuthResponse(user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DBSession) -> Response:
    token = request.cookies.get(get_settings().session_cookie_name)
    auth_service.logout(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response


@router.get("/me", response_model=AuthResponse)
def me(user: CurrentUser) -> AuthResponse:
    return AuthResponse(user=UserOut.model_validate(user))
