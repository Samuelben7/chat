from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    POSTGRES_DB: Optional[str] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None

    # Redis
    REDIS_URL: str
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None

    # WhatsApp
    WHATSAPP_TOKEN: str
    PHONE_NUMBER_ID: str
    VERIFY_TOKEN: str

    # Mercado Pago
    MERCADOPAGO_ACCESS_TOKEN: Optional[str] = None

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Email
    EMAIL_HOST_PASSWORD: Optional[str] = None

    # Frontend
    FRONTEND_URL: Optional[str] = "http://localhost:3000"

    # Internal API (for Celery -> API communication)
    INTERNAL_API_KEY: str = "celery-internal-key-2026"
    INTERNAL_API_URL: str = "http://api:8000"

    # App
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "WhatsApp Sistema"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
