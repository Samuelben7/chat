from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ==================== CONTATO UNIFICADO ====================

class ContatoUnificado(BaseModel):
    """Contato unificado (cliente registrado ou número de MensagemLog)"""
    whatsapp_number: str
    nome: Optional[str] = None
    cidade: Optional[str] = None
    cliente_id: Optional[int] = None
    registrado: bool = False
    ultimo_contato: Optional[datetime] = None
    total_mensagens: int = 0


class ContatoListResponse(BaseModel):
    contatos: List[ContatoUnificado]
    total: int
    page: int
    per_page: int


# ==================== LISTAS DE CONTATOS ====================

class ListaContatosCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    cor: str = '#3B82F6'


class ListaContatosUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    cor: Optional[str] = None


class ListaContatosResponse(BaseModel):
    id: int
    empresa_id: int
    nome: str
    descricao: Optional[str] = None
    cor: str
    total_membros: int = 0
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


# ==================== MEMBROS ====================

class ListaContatosMembroAdd(BaseModel):
    contatos: List[dict]  # [{"whatsapp_number": "...", "nome": "...", "cliente_id": null}]


class ListaContatosMembroResponse(BaseModel):
    id: int
    lista_id: int
    whatsapp_number: str
    nome: Optional[str] = None
    cliente_id: Optional[int] = None
    adicionado_em: datetime

    class Config:
        from_attributes = True
