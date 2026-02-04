from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database.database import get_db
from app.models.models import Atendente
from app.schemas.schemas import (
    AtendenteCreate, AtendenteUpdate, AtendenteResponse
)

router = APIRouter()


@router.get("/atendentes", response_model=List[AtendenteResponse])
async def listar_atendentes(
    status: str = None,
    pode_atender: bool = None,
    db: Session = Depends(get_db)
):
    """
    Lista todos os atendentes.
    Pode filtrar por status (online, offline, ausente) e disponibilidade.
    """
    query = db.query(Atendente)

    if status:
        query = query.filter(Atendente.status == status)
    if pode_atender is not None:
        query = query.filter(Atendente.pode_atender == pode_atender)

    atendentes = query.all()
    return atendentes


@router.get("/atendentes/{atendente_id}", response_model=AtendenteResponse)
async def obter_atendente(
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtém detalhes de um atendente específico.
    """
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    return atendente


@router.post("/atendentes", response_model=AtendenteResponse)
async def criar_atendente(
    atendente_data: AtendenteCreate,
    db: Session = Depends(get_db)
):
    """
    Cria um novo atendente.
    """
    # Verificar se user_id já existe
    existente = db.query(Atendente).filter(
        Atendente.user_id == atendente_data.user_id
    ).first()

    if existente:
        raise HTTPException(
            status_code=400,
            detail="Já existe um atendente com este user_id"
        )

    atendente = Atendente(
        user_id=atendente_data.user_id,
        nome_exibicao=atendente_data.nome_exibicao,
        status='offline',
        pode_atender=True
    )

    db.add(atendente)
    db.commit()
    db.refresh(atendente)

    return atendente


@router.patch("/atendentes/{atendente_id}", response_model=AtendenteResponse)
async def atualizar_atendente(
    atendente_id: int,
    update_data: AtendenteUpdate,
    db: Session = Depends(get_db)
):
    """
    Atualiza dados de um atendente.
    Usado para mudar status (online/offline/ausente) e disponibilidade.
    """
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    if update_data.status:
        atendente.status = update_data.status
        atendente.ultima_atividade = datetime.now()

    if update_data.pode_atender is not None:
        atendente.pode_atender = update_data.pode_atender

    db.commit()
    db.refresh(atendente)

    return atendente


@router.delete("/atendentes/{atendente_id}")
async def deletar_atendente(
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    Remove um atendente do sistema.
    """
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    db.delete(atendente)
    db.commit()

    return {"status": "success", "message": "Atendente removido com sucesso"}


@router.post("/atendentes/{atendente_id}/online")
async def marcar_online(
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    Marca atendente como online e disponível.
    """
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    atendente.status = 'online'
    atendente.pode_atender = True
    atendente.ultima_atividade = datetime.now()

    db.commit()

    return {"status": "success", "message": "Atendente agora está online"}


@router.post("/atendentes/{atendente_id}/offline")
async def marcar_offline(
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    Marca atendente como offline.
    """
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    atendente.status = 'offline'
    atendente.pode_atender = False
    atendente.ultima_atividade = datetime.now()

    db.commit()

    return {"status": "success", "message": "Atendente agora está offline"}


@router.get("/atendentes/{atendente_id}/estatisticas")
async def obter_estatisticas_atendente(
    atendente_id: int,
    db: Session = Depends(get_db)
):
    """
    Retorna estatísticas de atendimento de um atendente.
    """
    from app.models.models import Atendimento
    from sqlalchemy import func

    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    # Total de atendimentos
    total_atendimentos = db.query(Atendimento).filter(
        Atendimento.atendente_id == atendente_id
    ).count()

    # Atendimentos em andamento
    em_andamento = db.query(Atendimento).filter(
        Atendimento.atendente_id == atendente_id,
        Atendimento.status == 'em_atendimento'
    ).count()

    # Atendimentos finalizados
    finalizados = db.query(Atendimento).filter(
        Atendimento.atendente_id == atendente_id,
        Atendimento.status == 'finalizado'
    ).count()

    # Tempo médio de atendimento (em minutos)
    tempo_medio = db.query(
        func.avg(
            func.extract('epoch', Atendimento.finalizado_em - Atendimento.atribuido_em) / 60
        )
    ).filter(
        Atendimento.atendente_id == atendente_id,
        Atendimento.finalizado_em.isnot(None)
    ).scalar() or 0

    return {
        "atendente_id": atendente_id,
        "nome": atendente.nome_exibicao,
        "total_atendimentos": total_atendimentos,
        "em_andamento": em_andamento,
        "finalizados": finalizados,
        "tempo_medio_minutos": round(tempo_medio, 2)
    }
