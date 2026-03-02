"""
Schemas Pydantic para Autenticação
"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class LoginEmpresaRequest(BaseModel):
    """Request para login de empresa"""
    email: EmailStr
    senha: str


class LoginAtendenteRequest(BaseModel):
    """Request para login de atendente"""
    email: EmailStr
    senha: str


class TrocarSenhaRequest(BaseModel):
    """Request para trocar senha no primeiro login"""
    senha_nova: str


class TokenResponse(BaseModel):
    """Response com token JWT"""
    access_token: str
    token_type: str = "bearer"
    role: str  # 'empresa' ou 'atendente'
    empresa_id: int
    atendente_id: Optional[int] = None
    primeiro_login: bool = False


class UsuarioAtual(BaseModel):
    """Dados do usuário autenticado extraídos do token"""
    email: str
    empresa_id: int
    role: str
    atendente_id: Optional[int] = None
    primeiro_login: bool = False


class CriarAtendenteRequest(BaseModel):
    """Request para empresa criar novo atendente"""
    nome_exibicao: str
    email: EmailStr
    cpf: Optional[str] = None
    data_nascimento: Optional[str] = None  # formato: YYYY-MM-DD


class AtendenteResponse(BaseModel):
    """Response com dados do atendente criado"""
    id: int
    empresa_id: int
    nome_exibicao: str
    email: str
    cpf: Optional[str] = None
    data_nascimento: Optional[str] = None
    status: str
    pode_atender: bool
    criado_em: datetime

    class Config:
        from_attributes = True


class RegistroEmpresaRequest(BaseModel):
    """Request para cadastro de nova empresa"""
    nome: str
    cnpj: Optional[str] = None
    email: EmailStr
    telefone: Optional[str] = None
    senha: str

    # Credenciais WhatsApp (opcionais no cadastro inicial)
    whatsapp_token: Optional[str] = None
    phone_number_id: Optional[str] = None


class RegistroEmpresaResponse(BaseModel):
    """Response após cadastro de empresa"""
    mensagem: str
    email: str
    empresa_id: int


class ConfirmarEmailRequest(BaseModel):
    """Request para confirmar email com token"""
    token: str


class ConnectWhatsAppRequest(BaseModel):
    """Request para conectar WhatsApp via Embedded Signup"""
    code: str
    phone_number_id: str
    waba_id: str


class ConnectWhatsAppResponse(BaseModel):
    """Response após conectar WhatsApp"""
    mensagem: str
    phone_number_id: str
    waba_id: str
    conectado: bool = True


class WhatsAppStatusResponse(BaseModel):
    """Response com status da conexão WhatsApp"""
    conectado: bool
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None


class WhatsAppProfileResponse(BaseModel):
    """Status e perfil do WhatsApp Business via Meta API"""
    conectado: bool
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    display_phone_number: Optional[str] = None
    verified_name: Optional[str] = None
    status: Optional[str] = None
    quality_rating: Optional[str] = None
    name_status: Optional[str] = None
    about: Optional[str] = None
    profile_picture_url: Optional[str] = None
    # Apenas para admin
    token_preview: Optional[str] = None


class EsqueciSenhaRequest(BaseModel):
    """Request para solicitar recuperação de senha"""
    email: EmailStr


class RedefinirSenhaRequest(BaseModel):
    """Request para redefinir senha com token"""
    token: str
    nova_senha: str


class EsqueciSenhaResponse(BaseModel):
    """Response genérica após solicitar recuperação (não revela se email existe)"""
    mensagem: str


class EmpresaAdminResponse(BaseModel):
    """Response com dados da empresa para painel admin"""
    id: int
    nome: str
    cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    ativa: bool
    whatsapp_conectado: bool
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    criado_em: Optional[datetime] = None

    class Config:
        from_attributes = True
