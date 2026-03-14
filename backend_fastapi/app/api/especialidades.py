"""
CRUD de Especialidades por empresa.
Útil para clínicas (canal, limpeza...) e escritórios.
Cada especialidade tem nome, descrição, valor e duração.
Futuramente: integração com IA para agendamento automático.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime

from app.database.database import get_db
from app.models.models import Especialidade
from app.core.dependencies import EmpresaIdFromToken

router = APIRouter(prefix="/especialidades", tags=["especialidades"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class EspecialidadeCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    valor: Optional[Decimal] = None
    duracao_minutos: Optional[int] = None

class EspecialidadeUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    valor: Optional[Decimal] = None
    duracao_minutos: Optional[int] = None
    ativo: Optional[bool] = None

class EspecialidadeResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    valor: Optional[Decimal] = None
    duracao_minutos: Optional[int] = None
    ativo: bool
    criado_em: datetime
    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[EspecialidadeResponse])
async def listar_especialidades(
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Lista todas as especialidades da empresa."""
    return db.query(Especialidade).filter(
        Especialidade.empresa_id == empresa_id,
    ).order_by(Especialidade.nome).all()


@router.post("", response_model=EspecialidadeResponse, status_code=201)
async def criar_especialidade(
    dados: EspecialidadeCreate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    esp = Especialidade(
        empresa_id=empresa_id,
        nome=dados.nome,
        descricao=dados.descricao,
        valor=dados.valor,
        duracao_minutos=dados.duracao_minutos,
    )
    db.add(esp)
    db.commit()
    db.refresh(esp)
    return esp


@router.patch("/{esp_id}", response_model=EspecialidadeResponse)
async def atualizar_especialidade(
    esp_id: int,
    dados: EspecialidadeUpdate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    esp = db.query(Especialidade).filter(
        Especialidade.id == esp_id,
        Especialidade.empresa_id == empresa_id,
    ).first()
    if not esp:
        raise HTTPException(status_code=404, detail="Especialidade não encontrada")
    for field, value in dados.model_dump(exclude_unset=True).items():
        setattr(esp, field, value)
    db.commit()
    db.refresh(esp)
    return esp


@router.delete("/{esp_id}")
async def deletar_especialidade(
    esp_id: int,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    esp = db.query(Especialidade).filter(
        Especialidade.id == esp_id,
        Especialidade.empresa_id == empresa_id,
    ).first()
    if not esp:
        raise HTTPException(status_code=404, detail="Especialidade não encontrada")
    db.delete(esp)
    db.commit()
    return {"sucesso": True}
