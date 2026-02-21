from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_
from typing import List, Optional
from datetime import datetime
import random
import string

from app.database.database import get_db
from app.models.models import (
    MensagemLog, ChatSessao, Atendimento, Atendente, Cliente, Empresa, ConfiguracaoBot
)
from app.schemas.schemas import (
    ConversaPreview, ConversaDetalhes, AtendimentoUpdate, AtendimentoResponse
)
from app.core.dependencies import CurrentUser, CurrentAtendente, EmpresaIdFromToken
from app.core.redis_client import redis_cache
from app.core.websocket_manager import manager

router = APIRouter()


def gerar_protocolo_unico(db: Session) -> str:
    """Gera código de protocolo único e não repetível (6 chars alfanumérico maiúsculo)."""
    for _ in range(20):  # máximo 20 tentativas
        codigo = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        existe = db.query(Atendimento).filter(Atendimento.protocolo == codigo).first()
        if not existe:
            return codigo
    # Fallback com timestamp se colisões persistirem
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def protocolo_ativo(db: Session, empresa_id: int) -> bool:
    """Verifica se o protocolo de atendimento está ativado para a empresa."""
    config = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == 'protocolo_ativo'
    ).first()
    return config is not None and config.valor.lower() == 'true'


def enviar_mensagem_sistema(db: Session, whatsapp_number: str, empresa_id: int, mensagem: str):
    """
    Envia uma mensagem do sistema para o cliente via WhatsApp.
    Registra no banco e dispara via Celery.
    """
    from app.tasks.tasks import enviar_mensagem_whatsapp

    # Salvar mensagem no banco
    msg_log = MensagemLog(
        empresa_id=empresa_id,
        whatsapp_number=whatsapp_number,
        direcao="enviada",
        tipo_mensagem="text",
        conteudo=mensagem,
        estado_sessao="sistema"
    )
    db.add(msg_log)
    db.commit()

    # Enviar via Celery (MULTI-TENANT: passa empresa_id)
    enviar_mensagem_whatsapp.delay(
        to=whatsapp_number,
        message=mensagem,
        message_type="text",
        empresa_id=empresa_id  # CRÍTICO: passar empresa_id para usar credenciais corretas
    )

    print(f"📤 Mensagem sistema enviada para {whatsapp_number}: {mensagem}")


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
    
    PERMISSÕES:
    - Empresa: Vê TODAS as conversas da empresa
    - Atendente: Vê apenas:
      * Suas próprias conversas (atribuídas a ele)
      * Conversas na fila SEM atendente (aguardando/bot com atendente_id = NULL)
      * NÃO vê conversas de outros atendentes
    """
    # Cache key
    cache_key_parts = [f"conversas:emp:{empresa_id}"]
    if user.role == "atendente":
        cache_key_parts.append(f"atd:{user.atendente_id}")
    if status:
        cache_key_parts.append(f"st:{status}")
    cache_key = ":".join(cache_key_parts)

    # Tentar cache
    cached = redis_cache.get_json(cache_key)
    if cached:
        return [ConversaPreview(**item) for item in cached]

    # Subquery para não lidas
    nao_lidas_subq = db.query(
        MensagemLog.whatsapp_number,
        func.count(MensagemLog.id).label("nao_lidas")
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == "recebida",
        MensagemLog.lida == False
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para última mensagem
    ultima_msg_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label("max_timestamp")
    ).filter(
        MensagemLog.empresa_id == empresa_id
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para última recebida (presença)
    ultima_recebida_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label("ultima_recebida_em")
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == "recebida"
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery: apenas o atendimento mais recente por whatsapp_number (deduplica)
    latest_atend_subq = db.query(
        Atendimento.whatsapp_number,
        func.max(Atendimento.id).label("latest_id")
    ).group_by(Atendimento.whatsapp_number).subquery()

    # Query principal
    query = db.query(
        Atendimento.whatsapp_number,
        MensagemLog.conteudo.label("ultima_mensagem"),
        MensagemLog.timestamp,
        Atendimento.status,
        Atendente.nome_exibicao.label("atendente_nome"),
        func.coalesce(nao_lidas_subq.c.nao_lidas, 0).label("nao_lidas"),
        ultima_recebida_subq.c.ultima_recebida_em,
        Cliente.nome_completo.label("cliente_nome"),
    ).join(
        latest_atend_subq,
        Atendimento.id == latest_atend_subq.c.latest_id
    ).outerjoin(
        Atendente, Atendimento.atendente_id == Atendente.id
    ).outerjoin(
        Cliente,
        (Cliente.whatsapp_number == Atendimento.whatsapp_number) &
        (Cliente.empresa_id == empresa_id)
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

    # Filtrar por empresa
    query = query.filter(MensagemLog.empresa_id == empresa_id)

    # PERMISSÃO: Atendente vê apenas SUAS conversas OU conversas SEM atendente
    if user.role == "atendente":
        query = query.filter(
            or_(
                Atendimento.atendente_id == user.atendente_id,  # Suas conversas
                Atendimento.atendente_id == None  # Conversas na fila (sem atendente)
            )
        )

    # Filtros opcionais
    if status:
        query = query.filter(Atendimento.status == status)

    query = query.order_by(desc(Atendimento.ultima_mensagem_em)).limit(limit)
    resultados = query.all()

    # Montar resposta
    conversas = []
    for r in resultados:
        online_status = None
        if r.ultima_recebida_em:
            from datetime import timezone
            tempo_inativo = (datetime.now(timezone.utc) - r.ultima_recebida_em).total_seconds() / 60
            if tempo_inativo < 5:
                online_status = "online"
            elif tempo_inativo < 30:
                online_status = "ausente"

        conversas.append(ConversaPreview(
            whatsapp_number=r.whatsapp_number,
            cliente_nome=r.cliente_nome,
            ultima_mensagem=r.ultima_mensagem,
            timestamp=r.timestamp,
            nao_lidas=r.nao_lidas,
            atendente_nome=r.atendente_nome,
            status=r.status or "bot",
            online_status=online_status
        ))

    # Cache 30s
    redis_cache.set_json(cache_key, [c.model_dump() for c in conversas], ttl=30)
    return conversas


@router.get("/chat/conversa/{whatsapp_number}", response_model=ConversaDetalhes)
async def obter_conversa_detalhes(
    whatsapp_number: str,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Obtém detalhes de uma conversa.
    
    PERMISSÕES:
    - Empresa: Pode ver qualquer conversa
    - Atendente: Pode ver apenas suas conversas OU conversas na fila
    """
    cliente = db.query(Cliente).filter(
        Cliente.whatsapp_number == whatsapp_number,
        Cliente.empresa_id == empresa_id
    ).first()

    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(["bot", "aguardando", "em_atendimento"])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    # PERMISSÃO: Atendente só vê suas conversas ou conversas na fila
    if user.role == "atendente":
        if atendimento and atendimento.atendente_id and atendimento.atendente_id != user.atendente_id:
            raise HTTPException(
                status_code=403,
                detail="Esta conversa está sendo atendida por outro atendente"
            )

    # Buscar mensagens (últimas 100, filtradas por empresa)
    # Ordena DESC para pegar as mais recentes, depois inverte para ASC
    mensagens = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.empresa_id == empresa_id
    ).order_by(MensagemLog.timestamp.desc()).limit(100).all()

    # Inverter para ordem cronológica (mais antigas primeiro)
    mensagens = list(reversed(mensagens))

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
    """Atualiza dados de um atendimento."""
    atendimento = db.query(Atendimento).filter(
        Atendimento.id == atendimento_id
    ).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    if update_data.atendente_id is not None:
        atendimento.atendente_id = update_data.atendente_id
        if not atendimento.atribuido_em:
            atendimento.atribuido_em = datetime.now()

    if update_data.status:
        atendimento.status = update_data.status
        if update_data.status == "finalizado" and not atendimento.finalizado_em:
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
    Assume atendimento.
    - Atendente: só pode assumir se não houver outro atendente já atendendo.
    - Empresa: pode assumir a qualquer momento, inclusive de cima de um atendente.
      O atendente deslocado recebe notificação WebSocket em tempo real.
    """
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(["aguardando", "bot", "em_atendimento", "finalizado"])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    atendente_anterior_id = atendimento.atendente_id

    # Verificar se já está sendo atendido por outro
    if atendimento.atendente_id and atendimento.status == "em_atendimento":
        atendente_atual = db.query(Atendente).filter(
            Atendente.id == atendimento.atendente_id
        ).first()

        # Atendente NÃO pode tomar de outro atendente — só empresa pode
        if user.role == "atendente" and atendimento.atendente_id != user.atendente_id:
            nome_outro = atendente_atual.nome_exibicao if atendente_atual else "outro atendente"
            raise HTTPException(
                status_code=403,
                detail=f"⚠️ Este chat já está sendo atendido por *{nome_outro}*. "
                       f"Aguarde a finalização ou peça que ele transfira para você."
            )

    # Determinar quem assume
    if user.role == "atendente":
        novo_atendente_id = user.atendente_id
        atendente = db.query(Atendente).filter(Atendente.id == novo_atendente_id).first()
        nome_assumiu = atendente.nome_exibicao if atendente else "Atendente"
    else:
        # Empresa assume (sem atendente vinculado)
        novo_atendente_id = None
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        nome_assumiu = empresa.nome if empresa else "Suporte"

    # Gerar protocolo se ativo
    codigo_protocolo = None
    if protocolo_ativo(db, empresa_id):
        codigo_protocolo = gerar_protocolo_unico(db)

    # Atualizar atendimento
    atendimento.atendente_id = novo_atendente_id
    atendimento.empresa_id = empresa_id
    atendimento.status = "em_atendimento"
    atendimento.atribuido_em = datetime.now()
    if codigo_protocolo:
        atendimento.protocolo = codigo_protocolo

    db.commit()

    # Notificar atendente deslocado via WebSocket (se havia um e é diferente de quem assumiu)
    if atendente_anterior_id and atendente_anterior_id != novo_atendente_id:
        await manager.send_personal_message(
            {
                "event": "atendimento_removido",
                "data": {
                    "whatsapp_number": whatsapp_number,
                    "assumido_por": nome_assumiu,
                    "timestamp": datetime.now().isoformat()
                }
            },
            empresa_id=empresa_id,
            user_id=str(atendente_anterior_id)
        )

    # Broadcast para todos (atualiza UI de quem está vendo a fila)
    await manager.broadcast_to_empresa(empresa_id, {
        "event": "conversa_assumida",
        "data": {
            "whatsapp": whatsapp_number,
            "assumido_por": nome_assumiu,
            "timestamp": datetime.now().isoformat()
        }
    })

    # Montar e enviar mensagem ao cliente
    if codigo_protocolo:
        mensagem_cliente = (
            f"👤 *{nome_assumiu}* assumiu seu atendimento.\n"
            f"Protocolo: *{codigo_protocolo}*"
        )
    else:
        mensagem_cliente = f"👤 *{nome_assumiu}* assumiu seu atendimento. Como posso ajudá-lo?"

    enviar_mensagem_sistema(db, whatsapp_number, empresa_id, mensagem_cliente)

    # Invalidar cache
    redis_cache.invalidate_pattern(f"conversas:emp:{empresa_id}*")

    return {
        "status": "success",
        "message": "Atendimento assumido com sucesso",
        "assumido_por": nome_assumiu,
        "protocolo": codigo_protocolo
    }


@router.post("/chat/atendimento/{whatsapp_number}/transferir")
async def transferir_atendimento(
    whatsapp_number: str,
    body: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Transfere atendimento para outro atendente.
    Apenas empresa ou o próprio atendente pode transferir.
    Envia mensagem ao cliente informando a transferência.
    """
    novo_atendente_id = body.get("atendente_id")
    observacao = body.get("observacao")

    if not novo_atendente_id:
        raise HTTPException(status_code=400, detail="atendente_id é obrigatório")

    # Buscar atendimento
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(["aguardando", "em_atendimento"])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    # Verificar permissão (empresa pode sempre, atendente só se for dele)
    if user.role == "atendente" and atendimento.atendente_id != user.atendente_id:
        raise HTTPException(status_code=403, detail="Você não pode transferir este atendimento")

    # Buscar novo atendente
    novo_atendente = db.query(Atendente).filter(
        Atendente.id == novo_atendente_id,
        Atendente.empresa_id == empresa_id
    ).first()

    if not novo_atendente:
        raise HTTPException(status_code=404, detail="Atendente destino não encontrado")

    # Guardar atendente anterior
    atendente_anterior_id = atendimento.atendente_id
    atendente_anterior = None
    if atendimento.atendente_id:
        atendente_anterior = db.query(Atendente).filter(
            Atendente.id == atendimento.atendente_id
        ).first()

    # Transferir
    atendimento.atendente_id = novo_atendente_id
    atendimento.empresa_id = empresa_id
    atendimento.status = "em_atendimento"
    atendimento.atribuido_em = datetime.now()

    if observacao:
        notas = atendimento.notas_internas or ""
        atendimento.notas_internas = notas + f"\n[Transferido para {novo_atendente.nome_exibicao}] {observacao}"

    db.commit()

    # Notificar atendente anterior via WebSocket
    if atendente_anterior_id and atendente_anterior_id != novo_atendente_id:
        await manager.send_personal_message(
            {
                "event": "atendimento_transferido",
                "data": {
                    "whatsapp_number": whatsapp_number,
                    "transferido_para": novo_atendente.nome_exibicao,
                    "timestamp": datetime.now().isoformat()
                }
            },
            empresa_id=empresa_id,
            user_id=str(atendente_anterior_id)
        )

    # Broadcast para todos (atualiza sidebar)
    await manager.broadcast_to_empresa(empresa_id, {
        "event": "conversa_transferida",
        "data": {
            "whatsapp": whatsapp_number,
            "de": atendente_anterior.nome_exibicao if atendente_anterior else None,
            "para": novo_atendente.nome_exibicao,
            "timestamp": datetime.now().isoformat()
        }
    })

    # Enviar mensagem ao cliente
    mensagem = f"🔄 Seu atendimento foi transferido para *{novo_atendente.nome_exibicao}*. Como posso ajudá-lo?"
    enviar_mensagem_sistema(db, whatsapp_number, empresa_id, mensagem)

    # Invalidar cache
    redis_cache.invalidate_pattern(f"conversas:emp:{empresa_id}*")

    return {
        "status": "success",
        "message": f"Atendimento transferido para {novo_atendente.nome_exibicao}",
        "de": atendente_anterior.nome_exibicao if atendente_anterior else None,
        "para": novo_atendente.nome_exibicao
    }


@router.post("/chat/atendimento/{whatsapp_number}/finalizar")
async def finalizar_atendimento(
    whatsapp_number: str,
    body: dict = {},
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """
    Finaliza um atendimento e reseta o estado do bot.
    """
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status == "em_atendimento"
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento ativo não encontrado")

    # Verificar permissão
    if user and user.role == "atendente" and atendimento.atendente_id != user.atendente_id:
        raise HTTPException(status_code=403, detail="Você não pode finalizar este atendimento")

    atendimento.status = "finalizado"
    atendimento.finalizado_em = datetime.now()
    if body:
        atendimento.motivo_encerramento = body.get("motivo")
        atendimento.observacao_encerramento = body.get("observacao")

    # Resetar bot
    sessao = db.query(ChatSessao).filter(
        ChatSessao.whatsapp_number == whatsapp_number
    ).first()

    if sessao:
        sessao.estado_atual = "inicio"
        print(f"🔄 Bot resetado para 'inicio' - {whatsapp_number}")

    db.commit()

    # Invalidar cache
    if empresa_id:
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa_id}*")

    return {"status": "success", "message": "Atendimento finalizado e bot resetado"}


@router.post("/chat/atendimento/{whatsapp_number}/transferir-bot")
async def transferir_para_bot(
    whatsapp_number: str,
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Transfere atendimento de volta para o bot."""
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == whatsapp_number,
        Atendimento.status.in_(["aguardando", "em_atendimento"])
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if not atendimento:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")

    atendimento.status = "bot"
    atendimento.atendente_id = None

    sessao = db.query(ChatSessao).filter(
        ChatSessao.whatsapp_number == whatsapp_number
    ).first()

    if sessao:
        sessao.estado_atual = "inicio"
        print(f"🔄 Bot resetado para 'inicio' - {whatsapp_number}")

    db.commit()

    # Invalidar cache
    if empresa_id:
        redis_cache.invalidate_pattern(f"conversas:emp:{empresa_id}*")

    return {"status": "success", "message": "Atendimento transferido para o bot"}


@router.post("/chat/protocolo/toggle")
async def toggle_protocolo(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Liga/desliga o protocolo de atendimento para a empresa.
    Apenas empresa pode fazer isso.
    """
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas a empresa pode configurar o protocolo")

    config = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == 'protocolo_ativo'
    ).first()

    if config:
        # Alternar valor
        novo_valor = 'false' if config.valor.lower() == 'true' else 'true'
        config.valor = novo_valor
    else:
        # Criar configuração ativada
        config = ConfiguracaoBot(
            empresa_id=empresa_id,
            chave='protocolo_ativo',
            valor='true',
            descricao='Protocolo de atendimento automático',
            tipo_dado='booleano'
        )
        db.add(config)
        novo_valor = 'true'

    db.commit()
    return {"protocolo_ativo": novo_valor == 'true'}


@router.get("/chat/protocolo/status")
async def status_protocolo(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Retorna status atual do protocolo de atendimento."""
    return {"protocolo_ativo": protocolo_ativo(db, empresa_id)}


@router.get("/motivos-encerramento")
async def listar_motivos_encerramento(db: Session = Depends(get_db)):
    """Lista motivos de encerramento disponíveis"""
    from sqlalchemy import text
    result = db.execute(text("SELECT codigo, nome, emoji FROM motivos_encerramento WHERE ativo = true ORDER BY ordem"))
    motivos = [{"codigo": row[0], "nome": row[1], "emoji": row[2]} for row in result]
    return motivos


@router.delete("/chat/conversa/{whatsapp_number}")
async def deletar_conversa(
    whatsapp_number: str,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Apaga o histórico de mensagens de uma conversa (apenas empresa).
    Mantém o cadastro do cliente, apenas remove mensagens e atendimento.
    """
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas a empresa pode deletar conversas")

    # Remove mensagens
    deletadas = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.whatsapp_number == whatsapp_number
    ).delete()

    # Finaliza/remove atendimento ativo
    db.query(Atendimento).filter(
        Atendimento.empresa_id == empresa_id,
        Atendimento.whatsapp_number == whatsapp_number
    ).delete()

    db.commit()

    # Notifica via WS para remover da sidebar
    await manager.broadcast(
        {"event": "conversa_deletada", "data": {"whatsapp_number": whatsapp_number}},
        empresa_id=empresa_id
    )

    return {"detail": f"Conversa deletada ({deletadas} mensagens removidas)"}
