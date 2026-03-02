"""
Schemas Pydantic para Dev API Gateway
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ==================== AUTH ====================

class DevRegistroRequest(BaseModel):
    nome: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    senha: str = Field(..., min_length=6)
    telefone: Optional[str] = None
    empresa_nome: Optional[str] = None


class DevLoginRequest(BaseModel):
    email: EmailStr
    senha: str


class DevTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "dev"
    dev_id: int
    email: str


class DevRegistroResponse(BaseModel):
    """Response após cadastro dev (sem token — aguarda confirmação de email)"""
    mensagem: str
    email: str


class DevEsqueciSenhaRequest(BaseModel):
    email: EmailStr


class DevRedefinirSenhaRequest(BaseModel):
    token: str
    nova_senha: str


class DevConfirmarEmailRequest(BaseModel):
    token: str


# ==================== WHATSAPP ====================

class DevConnectWhatsAppRequest(BaseModel):
    code: str
    phone_number_id: str
    waba_id: str


# ==================== API KEYS ====================

class ApiKeyCreateRequest(BaseModel):
    nome: Optional[str] = Field(None, max_length=100, description="Nome descritivo da API key")


class ApiKeyResponse(BaseModel):
    id: int
    key_prefix: str
    nome: Optional[str]
    ativa: bool
    ultima_utilizacao: Optional[datetime]
    criada_em: datetime

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(BaseModel):
    """Retornado apenas na criacao - unica vez que a key completa e exibida."""
    id: int
    key: str  # key completa (so exibida 1x)
    key_prefix: str
    nome: Optional[str]
    message: str = "Salve esta chave agora. Ela nao sera exibida novamente."


# ==================== DEV PROFILE ====================

class DevPerfilResponse(BaseModel):
    id: int
    nome: str
    email: str
    telefone: Optional[str]
    empresa_nome: Optional[str]
    status: str
    trial_inicio: Optional[datetime]
    trial_fim: Optional[datetime]
    whatsapp_conectado: bool
    phone_number_id: Optional[str]
    waba_id: Optional[str]
    webhook_url: Optional[str]
    criado_em: datetime

    class Config:
        from_attributes = True


# ==================== WEBHOOK CONFIG ====================

class WebhookConfigRequest(BaseModel):
    webhook_url: str = Field(..., max_length=500)


class WebhookConfigResponse(BaseModel):
    webhook_url: Optional[str]
    webhook_secret: str
    ativo: bool


# ==================== USAGE ====================

class UsageSummaryResponse(BaseModel):
    requests_today: int
    requests_this_minute: int
    messages_this_month: int
    limits: dict
    percentage: dict
