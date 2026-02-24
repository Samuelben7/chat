"""
Endpoints publicos de planos (para landing page).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database.database import get_db
from app.models.models import Plano
from app.schemas.planos import PlanoResponse

router = APIRouter(prefix="/planos", tags=["planos"])


@router.get("", response_model=List[PlanoResponse])
async def listar_planos(db: Session = Depends(get_db)):
    """Lista todos os planos ativos (publico, para landing page)."""
    planos = db.query(Plano).filter(
        Plano.ativo == True
    ).order_by(Plano.tipo, Plano.ordem).all()
    return planos


@router.get("/empresa", response_model=List[PlanoResponse])
async def listar_planos_empresa(db: Session = Depends(get_db)):
    """Lista planos para empresas."""
    planos = db.query(Plano).filter(
        Plano.ativo == True,
        Plano.tipo == "empresa"
    ).order_by(Plano.ordem).all()
    return planos


@router.get("/dev", response_model=List[PlanoResponse])
async def listar_planos_dev(db: Session = Depends(get_db)):
    """Lista planos para desenvolvedores."""
    planos = db.query(Plano).filter(
        Plano.ativo == True,
        Plano.tipo == "dev"
    ).order_by(Plano.ordem).all()
    return planos
