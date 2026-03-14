"""
CRUD de vínculos entre a IA e BotFluxos existentes para coleta de dados estruturados.
A IA emite [COLETAR_DADOS:fluxo_id] para ativar um fluxo do Bot Builder.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database.database import get_db
from app.models.models import IaBotChamada, BotFluxo
from app.core.dependencies import EmpresaIdFromToken, CurrentUser

router = APIRouter(prefix="/ia/bot-chamadas", tags=["ia-bot-chamadas"])


class BotChamadaCreate(BaseModel):
    nome: str
    gatilho: str = "agendamento"  # agendamento | cadastro | manual
    bot_fluxo_id: int
    descricao_campos: Optional[str] = None


class BotChamadaUpdate(BaseModel):
    nome: Optional[str] = None
    gatilho: Optional[str] = None
    bot_fluxo_id: Optional[int] = None
    descricao_campos: Optional[str] = None
    ativo: Optional[bool] = None


@router.get("")
async def listar(
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    chamadas = db.query(IaBotChamada).filter(
        IaBotChamada.empresa_id == empresa_id
    ).order_by(IaBotChamada.criado_em).all()

    return [
        {
            "id": c.id,
            "nome": c.nome,
            "gatilho": c.gatilho,
            "bot_fluxo_id": c.bot_fluxo_id,
            "bot_fluxo_nome": c.bot_fluxo.nome if c.bot_fluxo else None,
            "descricao_campos": c.descricao_campos,
            "ativo": c.ativo,
            "criado_em": c.criado_em.isoformat() if c.criado_em else None,
        }
        for c in chamadas
    ]


@router.post("", status_code=201)
async def criar(
    dados: BotChamadaCreate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    # Valida que o fluxo pertence à empresa
    fluxo = db.query(BotFluxo).filter(
        BotFluxo.id == dados.bot_fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()
    if not fluxo:
        raise HTTPException(status_code=404, detail="Fluxo não encontrado nesta empresa")

    chamada = IaBotChamada(
        empresa_id=empresa_id,
        nome=dados.nome,
        gatilho=dados.gatilho,
        bot_fluxo_id=dados.bot_fluxo_id,
        descricao_campos=dados.descricao_campos,
    )
    db.add(chamada)
    db.commit()
    db.refresh(chamada)
    return {"id": chamada.id, "sucesso": True}


@router.patch("/{chamada_id}")
async def atualizar(
    chamada_id: int,
    dados: BotChamadaUpdate,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    chamada = db.query(IaBotChamada).filter(
        IaBotChamada.id == chamada_id,
        IaBotChamada.empresa_id == empresa_id
    ).first()
    if not chamada:
        raise HTTPException(status_code=404, detail="Chamada não encontrada")

    if dados.bot_fluxo_id:
        fluxo = db.query(BotFluxo).filter(
            BotFluxo.id == dados.bot_fluxo_id,
            BotFluxo.empresa_id == empresa_id
        ).first()
        if not fluxo:
            raise HTTPException(status_code=404, detail="Fluxo não encontrado nesta empresa")

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(chamada, campo, valor)

    db.commit()
    return {"sucesso": True}


@router.delete("/{chamada_id}")
async def deletar(
    chamada_id: int,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    chamada = db.query(IaBotChamada).filter(
        IaBotChamada.id == chamada_id,
        IaBotChamada.empresa_id == empresa_id
    ).first()
    if not chamada:
        raise HTTPException(status_code=404, detail="Chamada não encontrada")
    db.delete(chamada)
    db.commit()
    return {"sucesso": True}
