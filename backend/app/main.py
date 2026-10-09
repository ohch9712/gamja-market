from fastapi import FastAPI

from app.api.router import router
from app.core.config import get_settings
from app.core.cors import JsonCORSMiddleware
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="감자마켓 API", version="0.1.0")
    app.add_middleware(
        JsonCORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
