from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime

from app.database.database import get_db
from app.models.models import (
    MensagemLog, ChatSessao, Atendimento, Atendente, Cliente
)
from app.schemas.schemas import (
    ConversaPreview, ConversaDetalhes, AtendimentoUpdate, AtendimentoResponse
)
from app.core.dependencies import CurrentUser, CurrentAtendente, EmpresaIdFromToken
from app.core.redis_client import redis_cache

router = APIRouter()


@router.get("/chat/conversas", response_model=List[ConversaPreview])
async def listar_conversas(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    status: Optional[str] = None,
    atendente_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Lista todas as conversas ativas com preview.
    Retorna lista lateral do painel de chat.

    PERMISSÕES:
    - Empresa: Vê todas as conversas da empresa
    - Atendente: Vê apenas suas conversas (atribuídas a ele)

    OTIMIZAÇÕES:
    - Cache Redis (30 segundos)
    - Subquery para contagem de não lidas (sem N+1)
    """
    # Gerar chave de cache baseada nos filtros
    cache_key_parts = [f"conversas:emp:{empresa_id}"]
    if user.role == "atendente":
        cache_key_parts.append(f"atd:{user.atendente_id}")
    if status:
        cache_key_parts.append(f"st:{status}")
    if atendente_id:
        cache_key_parts.append(f"aid:{atendente_id}")

    cache_key = ":".join(cache_key_parts)

    # Tentar buscar do cache
    cached = redis_cache.get_json(cache_key)
    if cached:
        return [ConversaPreview(**item) for item in cached]

    # Subquery para contar mensagens não lidas (FIX N+1)
    nao_lidas_subq = db.query(
        MensagemLog.whatsapp_number,
        func.count(MensagemLog.id).label('nao_lidas')
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == "recebida",
        MensagemLog.lida == False
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para última mensagem (filtrada por empresa)
    ultima_msg_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label('max_timestamp')
    ).filter(
        MensagemLog.empresa_id == empresa_id
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para última mensagem RECEBIDA (para calcular presença online)
    ultima_recebida_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label('ultima_recebida_em')
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == 'recebida'
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Query principal com JOIN nas subqueries
    query = db.query(
        Atendimento.whatsapp_number,
        MensagemLog.conteudo.label('ultima_mensagem'),
        MensagemLog.timestamp,
        Atendimento.status,
        Atendente.nome_exibicao.label('atendente_nome'),
        func.coalesce(nao_lidas_subq.c.nao_lidas, 0).label('nao_lidas'),
        ultima_recebida_subq.c.ultima_recebida_em
    ).outerjoin(
        Atendente, Atendimento.atendente_id == Atendente.id
    ).outerjoin(
        ultima_msg_subq,
        Atendimento.whatsapp_number == ultima_msg_subq.c.whatsapp_number
    ).outerjoin(
        MensagemLog,
        (MensagemLog.whatsapp_number == ultima_msg_subq.c.whatsapp_number) &
        (MensagemLog.timestamp == ultima_msg_subq.c.max_timestamp)
    ).outerjoin(
        nao_lidas_subq,
        Atendimento.whatsapp_number == nao_lidas_subq.c.whatsapp_number
    ).outerjoin(
        ultima_recebida_subq,
        Atendimento.whatsapp_number == ultima_recebida_subq.c.whatsapp_number
    )

    # FILTRO AUTOMÁTICO: Apenas atendentes da mesma empresa OU sem atendente (bot)
    query = query.filter(
        (Atendente.empresa_id == empresa_id) | (Atendimento.atendente_id.is_(None))
    )

    # PERMISSÃO: Atendente vê apenas suas conversas
    if user.role == "atendente":
        query = query.filter(Atendimento.atendente_id == user.atendente_id)

    # Filtros adicionais
    if status:
        query = query.filter(Atendimento.status == status)
    if atendente_id:
        # Empresa pode filtrar por qualquer atendente, atendente ignora este filtro
        if user.role == "empresa":
            query = query.filter(Atendimento.atendente_id == atendente_id)

    query = query.order_by(desc(Atendimento.ultima_mensagem_em)).limit(limit)

    resultados = query.all()

    # Montar resposta
    conversas = []
    for r in resultados:
        # Calcular status de presença baseado em última mensagem RECEBIDA (otimizado com subquery)
        online_status = None
        if r.ultima_recebida_em:
            from datetime import datetime, timezone
            tempo_inativo = (datetime.now(timezone.utc) - r.ultima_recebida_em).total_seconds() / 60  # minutos

            if tempo_inativo < 5:
                online_status = 'online'  # Ativo há menos de 5 min
            elif tempo_inativo < 30:
                online_status = 'ausente'  # Ativo há 5-30 min
            # else: offline ou None (sem indicador)

        conversas.append(ConversaPreview(
            whatsapp_number=r.whatsapp_number,
            ultima_mensagem=r.ultima_mensagem,
            timestamp=r.timestamp,
            nao_lidas=r.nao_lidas,
            atendente_nome=r.atendente_nome,
            status=r.status or 'bot',
            online_status=online_status
        ))

    # Salvar no cache (30 segundos)
    redis_cache.set_json(
        cache_key,
        [c.model_dump() for c in conversas],
        ttl=30
    )

    return conversas


@router.get("/chat/conversa/{whatsapp_number}", response_model=ConversaDetalhes)
async def obter_conversa_detalhes(
    whatsapp_number: str,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Obtém detalhes completos de uma conversa específica.
    Inclui dados do cliente, atendimento e todas as mensagens.

    PERMISSÕES:
    - Empresa: Pode ver qualquer conversa
    - Atendente: Pode ver apenas conversas atribuídas a ele
    """
    # Buscar cliente (filtrado por empresa)
    cliente = db.query(Cliente).filter(
        Cliente.whatsapp_number == whatsapp_number,
        Cliente.empresa_id == empresa_id
    ).first()

    # Buscar atendimento ativo
    atendimento_query = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])
    )

    # PERMISSÃO: Atendente vê apenas suas conversas
    if user.role == "atendente":
        atendimento_query = atendimento_query.filter(
            Atendimento.atendente_id == user.atendente_id
        )

    atendimento = atendimento_query.order_by(Atendimento.iniciado_em.desc()).first()

    # Verificar se atendente tem permissão
    if user.role == "atendente" and not atendimento:
        raise HTTPException(
            status_code=403,
            detail="Você não tem permissão para ver esta conversa"
        )

    # Buscar mensagens (últimas 100, filtradas por empresa)
    mensagens = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.empresa_id == empresa_id
    ).order_by(MensagemLog.timestamp.asc()).limit(100).all()

    return ConversaDetalhes(
        whatsapp_number=whatsapp_number,
        cliente=cliente,
        atendimento=atendimento,
        mensagens=mensagens
    )


@router.patch("/chat/atendimento/{atendimento_id}", response_model=AtendimentoResponse)
async def atualizar_atendimento(
    atendimento_id: int,
    update_data: AtendimentoUpdate,
    db: Session = Depends(get_db)
):
    """
    Atualiza dados de um atendimento.
    Usado para atribuir atendente, mudar status, adicionar notas, etc.
    """
    atendimento = db.query(Atendimento).filter(
        Atendimento.id == atendimento_id
    ).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    # Atualizar campos
    if update_data.atendente_id is not None:
        atendimento.atendente_id = update_data.atendente_id
        if not atendimento.atribuido_em:
            atendimento.atribuido_em = datetime.now()

    if update_data.status:
        atendimento.status = update_data.status
        if update_data.status == 'finalizado' and not atendimento.finalizado_em:
            atendimento.finalizado_em = datetime.now()

    if update_data.notas_internas is not None:
        atendimento.notas_internas = update_data.notas_internas

    db.commit()
    db.refresh(atendimento)

    return atendimento


@router.post("/chat/atendimento/{whatsapp_number}/assumir")
async def assumir_atendimento(
    whatsapp_number: str,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Atendente assume um atendimento da fila.
    Muda status de 'aguardando' ou 'bot' para 'em_atendimento'.

    PERMISSÕES:
    - Atendente: Pode assumir para si mesmo
    - Empresa: Pode assumir e atribuir a qualquer atendente (atendente_id opcional no body)
    """
    # Determinar qual atendente vai assumir
    if user.role == "atendente":
        atendente_id = user.atendente_id
    else:
        # Empresa precisa informar qual atendente (implementar body depois)
        raise HTTPException(
            status_code=400,
            detail="Empresa deve usar endpoint específico para atribuir atendimento"
        )

    # Verificar se atendente existe e pertence à empresa
    atendente = db.query(Atendente).filter(
        Atendente.id == atendente_id,
        Atendente.empresa_id == empresa_id
    ).first()

    if not atendente:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")

    # Buscar atendimento disponível na fila
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(['aguardando', 'bot'])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(
            status_code=404,
            detail="Atendimento não encontrado ou já está sendo atendido"
        )

    # Atribuir atendente
    atendimento.atendente_id = atendente_id
    atendimento.status = 'em_atendimento'
    atendimento.atribuido_em = datetime.now()

    db.commit()

    return {
        "status": "success",
        "message": "Atendimento assumido com sucesso",
        "atendente_id": atendente_id
    }


@router.post("/chat/atendimento/{whatsapp_number}/finalizar")
async def finalizar_atendimento(
    whatsapp_number: str,
    db: Session = Depends(get_db)
):
    """
    Finaliza um atendimento e reseta o estado do bot.
    Quando cliente enviar próxima mensagem, bot começa do zero.
    """
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status == 'em_atendimento'
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento ativo não encontrado")

    atendimento.status = 'finalizado'
    atendimento.finalizado_em = datetime.now()

    # RESETAR ESTADO DO BOT - Bot recomeça do zero quando cliente voltar
    from app.models.models import ChatSessao
    sessao = db.query(ChatSessao).filter(
        ChatSessao.empresa_id == atendimento.empresa_id,
        ChatSessao.whatsapp_number == whatsapp_number
    ).first()

    if sessao:
        sessao.estado_atual = 'inicio'  # Reset para início
        print(f"🔄 Bot resetado para 'inicio' - {whatsapp_number}")

    db.commit()

    return {"status": "success", "message": "Atendimento finalizado e bot resetado"}


@router.post("/chat/atendimento/{whatsapp_number}/transferir-bot")
async def transferir_para_bot(
    whatsapp_number: str,
    db: Session = Depends(get_db)
):
    """
    Transfere atendimento de volta para o bot.
    """
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(['aguardando', 'em_atendimento'])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    atendimento.status = 'bot'
    atendimento.atendente_id = None

    # RESETAR ESTADO DO BOT - Bot recomeça do zero
    from app.models.models import ChatSessao
    sessao = db.query(ChatSessao).filter(
        ChatSessao.empresa_id == atendimento.empresa_id,
        ChatSessao.whatsapp_number == whatsapp_number
    ).first()

    if sessao:
        sessao.estado_atual = 'inicio'  # Reset para início
        print(f"🔄 Bot resetado para 'inicio' - {whatsapp_number}")

    db.commit()

    return {"status": "success", "message": "Atendimento transferido para o bot (resetado)"}
