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

    # Email / SMTP
    SMTP_SERVER: str = "smtp.zoho.com"
    SMTP_PORT: int = 587
    SMTP_SENDER_EMAIL: str = ""
    SMTP_PASSWORD: str = ""

    # Frontend
    FRONTEND_URL: Optional[str] = "http://localhost:3000"

    # Public URL (for WhatsApp to access uploaded images)
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Internal API (for Celery -> API communication)
    INTERNAL_API_KEY: str = "celery-internal-key-2026"
    INTERNAL_API_URL: str = "http://api:8000"

    # Meta Embedded Signup (Tech Provider)
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_ES_CONFIG_ID: str = ""
    ADMIN_NOTIFICATION_EMAIL: str = ""
    ADMIN_SECRET_KEY: str = ""

    # Mercado Pago (Plataforma)
    MP_ACCESS_TOKEN: Optional[str] = None
    MP_PUBLIC_KEY: Optional[str] = None

    # Dev API Gateway
    GATEWAY_RATE_LIMIT_PER_MIN: int = 60
    GATEWAY_MESSAGES_PER_MONTH: int = 1000
    DEV_TRIAL_DAYS: int = 15

    # Anthropic (Claude AI)
    ANTHROPIC_API_KEY: Optional[str] = None

    # App
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "WhatsApp Sistema"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
