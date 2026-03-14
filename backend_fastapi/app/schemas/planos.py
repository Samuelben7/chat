"""
Schemas para Planos, Assinaturas e Pagamentos da plataforma.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


# ==================== PLANOS ====================

class PlanoCreate(BaseModel):
    tipo: str = Field(..., pattern="^(empresa|dev)$")
    nome: str = Field(..., min_length=2, max_length=100)
    preco_mensal: Decimal = Field(..., gt=0)
    descricao: Optional[str] = None
    features: List[str] = []
    limites: dict = {}
    ordem: int = 0


class PlanoUpdate(BaseModel):
    nome: Optional[str] = None
    preco_mensal: Optional[Decimal] = None
    descricao: Optional[str] = None
    features: Optional[List[str]] = None
    limites: Optional[dict] = None
    ativo: Optional[bool] = None
    ordem: Optional[int] = None


class PlanoResponse(BaseModel):
    id: int
    tipo: str
    nome: str
    preco_mensal: float
    descricao: Optional[str]
    features: list
    limites: dict
    ativo: bool
    ordem: int

    class Config:
        from_attributes = True


# ==================== ASSINATURAS ====================

class AssinaturaResponse(BaseModel):
    id: int
    tipo_usuario: str
    plano_id: int
    plano_nome: Optional[str] = None
    status: str
    data_inicio: Optional[datetime]
    data_proximo_vencimento: Optional[datetime]
    # Plano personalizado
    is_personalizado: bool = False
    plano_personalizado_nome: Optional[str] = None
    preco_personalizado: Optional[Decimal] = None
    limites_personalizados: Optional[dict] = None
    dias_gratuitos: int = 0
    trial_expira_em: Optional[datetime] = None
    # Campos efetivos (considera personalizado se existir)
    preco_efetivo: Optional[Decimal] = None
    limites_efetivos: Optional[dict] = None
    nome_efetivo: Optional[str] = None

    class Config:
        from_attributes = True


class AssinaturaCriarRequest(BaseModel):
    plano_id: int


# ==================== PAGAMENTOS ====================

class PagamentoPixRequest(BaseModel):
    assinatura_id: int
    email: str


class PagamentoPixResponse(BaseModel):
    payment_id: str
    qr_code: str
    qr_code_base64: str
    valor: float
    status: str = "pending"


class PagamentoCartaoRequest(BaseModel):
    assinatura_id: int
    token_cartao: str  # Token do MercadoPago.js
    email: str
    parcelas: int = 1


class PagamentoCartaoResponse(BaseModel):
    payment_id: str
    status: str
    status_detail: str
    valor: float


class PagamentoResponse(BaseModel):
    id: int
    assinatura_id: int
    valor: float
    metodo: str
    status: str
    mp_payment_id: Optional[str]
    criado_em: datetime

    class Config:
        from_attributes = True
