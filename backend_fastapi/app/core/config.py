from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

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

    # App
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "WhatsApp Sistema"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
