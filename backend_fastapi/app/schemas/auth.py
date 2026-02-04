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
