"""
CRUD de Setores/Departamentos por empresa.
A empresa cria setores (ex: Loja 1, Financeiro, Cível).
Atendentes são associados a setores.
Na transferência, o atendente vê setores e atendentes dentro de cada um.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database.database import get_db
from app.models.models import Setor, AtendenteSetor, Atendente
from app.core.dependencies import EmpresaIdFromToken

router = APIRouter(prefix="/setores", tags=["setores"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SetorCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    ordem: Optional[int] = 0

class SetorUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None
    ordem: Optional[int] = None

class AtendenteSimples(BaseModel):
    id: int
    nome_exibicao: str
    status: str
    foto_url: Optional[str] = None
    class Config:
        from_attributes = True

class SetorResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    ativo: bool
    ordem: int
    criado_em: datetime
    atendentes: List[AtendenteSimples] = []
    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _setor_to_response(setor: Setor) -> SetorResponse:
    atendentes = [
        AtendenteSimples(
            id=rel.atendente.id,
            nome_exibicao=rel.atendente.nome_exibicao,
            status=rel.atendente.status,
            foto_url=rel.atendente.foto_url,
        )
        for rel in setor.atendentes
        if rel.atendente
    ]
    return SetorResponse(
        id=setor.id,
        nome=setor.nome,
        descricao=setor.descricao,
        ativo=setor.ativo,
        ordem=setor.ordem,
        criado_em=setor.criado_em,
        atendentes=atendentes,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/para-transferencia", response_model=List[SetorResponse])
async def setores_para_transferencia(
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """
    Retorna setores ativos com atendentes disponíveis para transferência.
    Usado no modal de transferência do atendente.
    """
    setores = db.query(Setor).filter(
        Setor.empresa_id == empresa_id,
        Setor.ativo == True,
    ).order_by(Setor.ordem, Setor.nome).all()
    return [_setor_to_response(s) for s in setores]


@router.get("", response_model=List[SetorResponse])
async def listar_setores(
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Lista todos os setores da empresa com seus atendentes."""
    setores = db.query(Setor).filter(
        Setor.empresa_id == empresa_id,
    ).order_by(Setor.ordem, Setor.nome).all()
    return [_setor_to_response(s) for s in setores]


@router.post("", response_model=SetorResponse, status_code=201)
async def criar_setor(
    dados: SetorCreate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Cria novo setor. Apenas empresa pode criar."""
    setor = Setor(
        empresa_id=empresa_id,
        nome=dados.nome,
        descricao=dados.descricao,
        ordem=dados.ordem or 0,
    )
    db.add(setor)
    db.commit()
    db.refresh(setor)
    return _setor_to_response(setor)


@router.patch("/{setor_id}", response_model=SetorResponse)
async def atualizar_setor(
    setor_id: int,
    dados: SetorUpdate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    setor = db.query(Setor).filter(Setor.id == setor_id, Setor.empresa_id == empresa_id).first()
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    for field, value in dados.model_dump(exclude_unset=True).items():
        setattr(setor, field, value)
    db.commit()
    db.refresh(setor)
    return _setor_to_response(setor)


@router.delete("/{setor_id}")
async def deletar_setor(
    setor_id: int,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    setor = db.query(Setor).filter(Setor.id == setor_id, Setor.empresa_id == empresa_id).first()
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    db.delete(setor)
    db.commit()
    return {"sucesso": True}


@router.post("/{setor_id}/atendentes/{atendente_id}")
async def adicionar_atendente_setor(
    setor_id: int,
    atendente_id: int,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Adiciona atendente a um setor."""
    setor = db.query(Setor).filter(Setor.id == setor_id, Setor.empresa_id == empresa_id).first()
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")

    atendente = db.query(Atendente).filter(
        Atendente.id == atendente_id, Atendente.empresa_id == empresa_id
    ).first()
    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    existe = db.query(AtendenteSetor).filter(
        AtendenteSetor.atendente_id == atendente_id,
        AtendenteSetor.setor_id == setor_id,
    ).first()
    if existe:
        raise HTTPException(status_code=409, detail="Atendente já está neste setor")

    rel = AtendenteSetor(atendente_id=atendente_id, setor_id=setor_id)
    db.add(rel)
    db.commit()
    return {"sucesso": True}


@router.delete("/{setor_id}/atendentes/{atendente_id}")
async def remover_atendente_setor(
    setor_id: int,
    atendente_id: int,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Remove atendente de um setor."""
    setor = db.query(Setor).filter(Setor.id == setor_id, Setor.empresa_id == empresa_id).first()
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")

    rel = db.query(AtendenteSetor).filter(
        AtendenteSetor.atendente_id == atendente_id,
        AtendenteSetor.setor_id == setor_id,
    ).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Atendente não está neste setor")

    db.delete(rel)
    db.commit()
    return {"sucesso": True}
