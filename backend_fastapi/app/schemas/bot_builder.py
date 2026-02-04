"""
Schemas para Bot Builder
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ========== OPÇÃO ==========
class BotFluxoOpcaoBase(BaseModel):
    tipo: str = Field(..., description="Tipo: lista_item, botao, resposta_rapida")
    titulo: str = Field(..., max_length=255)
    descricao: Optional[str] = None
    valor: Optional[str] = None
    proximo_no_id: Optional[int] = None
    ordem: int = 0


class BotFluxoOpcaoCreate(BotFluxoOpcaoBase):
    pass


class BotFluxoOpcaoUpdate(BaseModel):
    tipo: Optional[str] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    valor: Optional[str] = None
    proximo_no_id: Optional[int] = None
    ordem: Optional[int] = None


class BotFluxoOpcaoResponse(BotFluxoOpcaoBase):
    id: int
    no_id: int
    criado_em: datetime

    class Config:
        from_attributes = True


# ========== NÓ ==========
class BotFluxoNoBase(BaseModel):
    identificador: str = Field(..., max_length=100)
    tipo: str = Field(..., description="Tipo: mensagem, lista, botoes, condicional, transferir_atendente")
    titulo: Optional[str] = Field(None, max_length=255)
    conteudo: Optional[str] = None
    dados_extras: Dict[str, Any] = Field(default_factory=dict)
    proximo_no_id: Optional[int] = None
    ordem: int = 0


class BotFluxoNoCreate(BotFluxoNoBase):
    opcoes: List[BotFluxoOpcaoCreate] = Field(default_factory=list)


class BotFluxoNoUpdate(BaseModel):
    identificador: Optional[str] = None
    tipo: Optional[str] = None
    titulo: Optional[str] = None
    conteudo: Optional[str] = None
    dados_extras: Optional[Dict[str, Any]] = None
    proximo_no_id: Optional[int] = None
    ordem: Optional[int] = None


class BotFluxoNoResponse(BotFluxoNoBase):
    id: int
    fluxo_id: int
    criado_em: datetime
    opcoes: List[BotFluxoOpcaoResponse] = []

    class Config:
        from_attributes = True


# ========== FLUXO ==========
class BotFluxoBase(BaseModel):
    nome: str = Field(..., max_length=255)
    descricao: Optional[str] = None
    ativo: bool = False


class BotFluxoCreate(BotFluxoBase):
    pass


class BotFluxoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


class BotFluxoResponse(BotFluxoBase):
    id: int
    empresa_id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class BotFluxoDetalhado(BotFluxoResponse):
    """Fluxo com todos os nós e opções"""
    nos: List[BotFluxoNoResponse] = []

    class Config:
        from_attributes = True


# ========== REQUISIÇÕES ESPECIAIS ==========
class BotFluxoAtivar(BaseModel):
    """Request para ativar/desativar um fluxo"""
    ativo: bool


class BotFluxoClonar(BaseModel):
    """Request para clonar um fluxo"""
    novo_nome: str = Field(..., max_length=255)
    nova_descricao: Optional[str] = None
