"""
CRUD Admin para planos.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database.database import get_db
from app.models.models import Plano
from app.schemas.planos import PlanoCreate, PlanoUpdate, PlanoResponse
from app.core.dependencies import CurrentUser

router = APIRouter(prefix="/admin/planos", tags=["admin-planos"])


def _require_admin(user: CurrentUser):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")


@router.post("", response_model=PlanoResponse, status_code=201)
async def criar_plano(
    dados: PlanoCreate,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Cria novo plano (admin)."""
    _require_admin(user)

    plano = Plano(
        tipo=dados.tipo,
        nome=dados.nome,
        preco_mensal=dados.preco_mensal,
        descricao=dados.descricao,
        features=dados.features,
        limites=dados.limites,
        ordem=dados.ordem,
    )
    db.add(plano)
    db.commit()
    db.refresh(plano)
    return plano


@router.put("/{plano_id}", response_model=PlanoResponse)
async def atualizar_plano(
    plano_id: int,
    dados: PlanoUpdate,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Atualiza plano existente (admin)."""
    _require_admin(user)

    plano = db.query(Plano).filter(Plano.id == plano_id).first()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano nao encontrado")

    for field, value in dados.model_dump(exclude_unset=True).items():
        setattr(plano, field, value)

    db.commit()
    db.refresh(plano)
    return plano


@router.delete("/{plano_id}")
async def deletar_plano(
    plano_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Desativa plano (soft delete, admin)."""
    _require_admin(user)

    plano = db.query(Plano).filter(Plano.id == plano_id).first()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano nao encontrado")

    plano.ativo = False
    db.commit()
    return {"message": "Plano desativado"}
