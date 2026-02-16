"""
Endpoints para o Painel do Atendente
Gerencia fila de atendimento, conversas atribuídas e transferências
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import Optional, List, Annotated
from datetime import datetime, timedelta
import os
import uuid
import shutil
from pathlib import Path

from app.database.database import get_db
from app.models.models import Cliente, Atendimento, Atendente, MensagemLog
from app.core.auth import validar_permissao_atendente
from pydantic import BaseModel
from app.api.websocket_endpoint import notify_conversa_assumida, notify_conversa_transferida

router = APIRouter()


# ========== SCHEMAS ==========

class ConversaFilaResponse(BaseModel):
    """Conversa disponível na fila para assumir"""
    whatsapp_number: str
    cliente_nome: str
    status: str
    ultima_mensagem: Optional[str] = None
    ultima_mensagem_timestamp: Optional[datetime] = None
    tempo_espera_minutos: Optional[int] = None
    total_mensagens_pendentes: int = 0

    class Config:
        from_attributes = True


class ConversaAtivaResponse(BaseModel):
    """Conversa ativa atribuída ao atendente"""
    whatsapp_number: str
    cliente_nome: str
    status: str
    atribuido_em: Optional[datetime] = None
    ultima_mensagem: Optional[str] = None
    ultima_mensagem_timestamp: Optional[datetime] = None
    mensagens_nao_lidas: int = 0

    class Config:
        from_attributes = True


class MetricasAtendenteResponse(BaseModel):
    """Métricas do painel do atendente"""
    minhas_conversas_ativas: int
    conversas_na_fila: int
    tempo_medio_resposta_minutos: float
    total_mensagens_enviadas_hoje: int
    total_conversas_assumidas_hoje: int


class TransferirConversaRequest(BaseModel):
    """Request para transferir conversa"""
    whatsapp_number: str
    atendente_destino_id: int
    motivo: Optional[str] = None


class TransferirConversaResponse(BaseModel):
    """Response de transferência"""
    sucesso: bool
    mensagem: str
    whatsapp_number: str
    transferido_para: str


# ========== DEPENDENCIES ==========

async def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    """Extrai o token JWT do header Authorization"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Formato de token inválido. Use: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return authorization.replace("Bearer ", "")


async def get_current_atendente(
    token: str = Depends(get_token_from_header)
) -> tuple[int, int]:
    """
    Dependency que valida token de atendente e retorna (atendente_id, empresa_id)
    """
    return validar_permissao_atendente(token)


# Tipo anotado para usar em endpoints
CurrentAtendente = Annotated[tuple[int, int], Depends(get_current_atendente)]


# ========== ENDPOINTS ==========

@router.get("/atendente/fila", response_model=List[ConversaFilaResponse])
async def listar_fila_atendimento(
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Lista conversas disponíveis na fila para o atendente assumir

    - Retorna conversas com status 'bot' ou 'aguardando'
    - Filtra pela empresa do atendente (via whatsapp_number em Cliente)
    - Ordena por tempo de espera (mais antigas primeiro)

    OTIMIZAÇÃO: Subqueries para evitar N+1
    """
    atendente_id, empresa_id = atendente_info

    # Subquery para última mensagem
    ultima_msg_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label('max_timestamp')
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para contar mensagens pendentes
    pendentes_subq = db.query(
        MensagemLog.whatsapp_number,
        func.count(MensagemLog.id).label('total_pendentes')
    ).filter(
        and_(
            MensagemLog.direcao == 'recebida',
            MensagemLog.lida == False
        )
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Query principal com JOINs
    conversas_fila = db.query(
        Atendimento,
        Cliente,
        MensagemLog.conteudo.label('ultima_mensagem'),
        MensagemLog.timestamp.label('ultima_timestamp'),
        func.coalesce(pendentes_subq.c.total_pendentes, 0).label('total_pendentes')
    ).join(
        Cliente,
        Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).outerjoin(
        ultima_msg_subq,
        Atendimento.whatsapp_number == ultima_msg_subq.c.whatsapp_number
    ).outerjoin(
        MensagemLog,
        and_(
            MensagemLog.whatsapp_number == ultima_msg_subq.c.whatsapp_number,
            MensagemLog.timestamp == ultima_msg_subq.c.max_timestamp
        )
    ).outerjoin(
        pendentes_subq,
        Atendimento.whatsapp_number == pendentes_subq.c.whatsapp_number
    ).filter(
        and_(
            Cliente.empresa_id == empresa_id,
            or_(
                Atendimento.status == 'bot',
                Atendimento.status == 'aguardando'
            )
        )
    ).order_by(
        Atendimento.iniciado_em.asc()
    ).all()

    resultado = []
    for atendimento, cliente, ultima_msg, ultima_timestamp, total_pendentes in conversas_fila:
        # Calcular tempo de espera
        tempo_espera = None
        if atendimento.iniciado_em:
            from datetime import timezone
            now = datetime.now(timezone.utc)
            iniciado = atendimento.iniciado_em
            if iniciado.tzinfo is None:
                iniciado = iniciado.replace(tzinfo=timezone.utc)
            delta = now - iniciado
            tempo_espera = int(delta.total_seconds() / 60)

        resultado.append(ConversaFilaResponse(
            whatsapp_number=atendimento.whatsapp_number,
            cliente_nome=cliente.nome or atendimento.whatsapp_number,
            status=atendimento.status,
            ultima_mensagem=ultima_msg,
            ultima_mensagem_timestamp=ultima_timestamp,
            tempo_espera_minutos=tempo_espera,
            total_mensagens_pendentes=total_pendentes
        ))

    return resultado


@router.get("/atendente/meus-chats", response_model=List[ConversaAtivaResponse])
async def listar_meus_chats(
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Lista apenas conversas atribuídas ao atendente atual

    - Retorna conversas com status 'em_atendimento' onde atendente_id = current
    - Ordena por última mensagem (mais recentes primeiro)

    OTIMIZAÇÃO: Subqueries para evitar N+1
    """
    atendente_id, empresa_id = atendente_info

    # Subquery para última mensagem
    ultima_msg_subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label('max_timestamp')
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Subquery para mensagens não lidas
    nao_lidas_subq = db.query(
        MensagemLog.whatsapp_number,
        func.count(MensagemLog.id).label('nao_lidas')
    ).filter(
        and_(
            MensagemLog.direcao == 'recebida',
            MensagemLog.lida == False
        )
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Query principal com JOINs
    minhas_conversas = db.query(
        Atendimento,
        Cliente,
        MensagemLog.conteudo.label('ultima_mensagem'),
        MensagemLog.timestamp.label('ultima_timestamp'),
        func.coalesce(nao_lidas_subq.c.nao_lidas, 0).label('nao_lidas')
    ).join(
        Cliente,
        Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).outerjoin(
        ultima_msg_subq,
        Atendimento.whatsapp_number == ultima_msg_subq.c.whatsapp_number
    ).outerjoin(
        MensagemLog,
        and_(
            MensagemLog.whatsapp_number == ultima_msg_subq.c.whatsapp_number,
            MensagemLog.timestamp == ultima_msg_subq.c.max_timestamp
        )
    ).outerjoin(
        nao_lidas_subq,
        Atendimento.whatsapp_number == nao_lidas_subq.c.whatsapp_number
    ).filter(
        and_(
            Cliente.empresa_id == empresa_id,
            Atendimento.atendente_id == atendente_id,
            Atendimento.status == 'em_atendimento'
        )
    ).order_by(
        Atendimento.ultima_mensagem_em.desc()
    ).all()

    resultado = []
    for atendimento, cliente, ultima_msg, ultima_timestamp, nao_lidas in minhas_conversas:
        resultado.append(ConversaAtivaResponse(
            whatsapp_number=atendimento.whatsapp_number,
            cliente_nome=cliente.nome or atendimento.whatsapp_number,
            status=atendimento.status,
            atribuido_em=atendimento.atribuido_em,
            ultima_mensagem=ultima_msg,
            ultima_mensagem_timestamp=ultima_timestamp,
            mensagens_nao_lidas=nao_lidas
        ))

    return resultado


@router.post("/atendente/assumir/{whatsapp_number}")
async def assumir_conversa(
    whatsapp_number: str,
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Assume uma conversa da fila

    - Altera status da conversa de 'bot'/'aguardando' para 'em_atendimento'
    - Atribui atendente_id
    - Envia mensagem automática ao cliente
    - Verifica se já está sendo atendido por outro
    """
    atendente_id, empresa_id = atendente_info

    # Buscar conversa
    atendimento = db.query(Atendimento).join(
        Cliente, Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        and_(
            Atendimento.whatsapp_number == whatsapp_number,
            Cliente.empresa_id == empresa_id
        )
    ).first()

    if not atendimento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversa não encontrada"
        )

    # Verificar se já está sendo atendido por OUTRO atendente
    if atendimento.status == 'em_atendimento' and atendimento.atendente_id:
        if atendimento.atendente_id != atendente_id:
            outro_atendente = db.query(Atendente).filter(
                Atendente.id == atendimento.atendente_id
            ).first()
            nome_outro = outro_atendente.nome_exibicao if outro_atendente else "outro atendente"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"⚠️ Este chat já está sendo atendido por *{nome_outro}*. Aguarde a finalização ou peça a transferência."
            )
        else:
            # Já é o próprio atendente - retornar sucesso sem mudar nada
            return {
                "sucesso": True,
                "mensagem": "Você já está atendendo esta conversa",
                "whatsapp_number": whatsapp_number,
                "atendente": db.query(Atendente).filter(Atendente.id == atendente_id).first().nome_exibicao
            }

    # Verificar se está disponível para assumir (inclui finalizado para re-assumir)
    if atendimento.status not in ['bot', 'aguardando', 'finalizado']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Conversa não está disponível para assumir (status atual: {atendimento.status})"
        )

    # Buscar dados do atendente
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()
    if not atendente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Atendente não encontrado"
        )

    # Atualizar conversa
    atendimento.status = 'em_atendimento'
    atendimento.atendente_id = atendente_id
    atendimento.atribuido_em = datetime.now()

    db.commit()

    # Enviar mensagem automática ao cliente via WhatsApp
    try:
        from app.tasks.tasks import enviar_mensagem_whatsapp
        mensagem = f"👋 Olá! Você agora está sendo atendido por *{atendente.nome_exibicao}*. Como posso ajudá-lo?"
        
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
            empresa_id=empresa_id
        )
        print(f"📤 Mensagem de boas-vindas enviada para {whatsapp_number}")
    except Exception as e:
        print(f"⚠️ Erro ao enviar mensagem de boas-vindas: {e}")

    # Notificar via WebSocket
    try:
        await notify_conversa_assumida(
            empresa_id=empresa_id,
            whatsapp=whatsapp_number,
            atendente_id=atendente_id,
            atendente_nome=atendente.nome_exibicao
        )
    except Exception as e:
        print(f"Erro ao notificar via WebSocket: {e}")

    return {
        "sucesso": True,
        "mensagem": "Conversa assumida com sucesso",
        "whatsapp_number": whatsapp_number,
        "atendente": atendente.nome_exibicao
    }


@router.post("/atendente/transferir", response_model=TransferirConversaResponse)
async def transferir_conversa(
    dados: TransferirConversaRequest,
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Transfere uma conversa para outro atendente da mesma empresa

    - Atendente só pode transferir suas próprias conversas
    - Atendente destino deve ser da mesma empresa
    """
    atendente_id, empresa_id = atendente_info

    # Buscar conversa
    atendimento = db.query(Atendimento).join(
        Cliente, Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        and_(
            Atendimento.whatsapp_number == dados.whatsapp_number,
            Cliente.empresa_id == empresa_id
        )
    ).first()

    if not atendimento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversa não encontrada"
        )

    # Verificar se é o dono da conversa
    if atendimento.atendente_id != atendente_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você só pode transferir suas próprias conversas"
        )

    # Buscar atendente de origem
    atendente_origem = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    # Buscar atendente destino
    atendente_destino = db.query(Atendente).filter(
        and_(
            Atendente.id == dados.atendente_destino_id,
            Atendente.empresa_id == empresa_id
        )
    ).first()

    if not atendente_destino:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Atendente de destino não encontrado ou não pertence à sua empresa"
        )

    # Não pode transferir para si mesmo
    if atendente_id == dados.atendente_destino_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível transferir para si mesmo"
        )

    # Atualizar conversa
    atendimento.atendente_id = dados.atendente_destino_id
    atendimento.atribuido_em = datetime.now()

    # Adicionar nota interna sobre transferência
    nota_transferencia = f'Transferida de {atendente_origem.nome_exibicao} para {atendente_destino.nome_exibicao}'
    if dados.motivo:
        nota_transferencia += f' - Motivo: {dados.motivo}'

    if atendimento.notas_internas:
        atendimento.notas_internas += f'\n\n[{datetime.now().strftime("%Y-%m-%d %H:%M")}] {nota_transferencia}'
    else:
        atendimento.notas_internas = f'[{datetime.now().strftime("%Y-%m-%d %H:%M")}] {nota_transferencia}'

    db.commit()

    # Enviar mensagem automática ao cliente via WhatsApp
    try:
        from app.tasks.tasks import enviar_mensagem_whatsapp
        mensagem = f"🔄 Seu atendimento foi transferido. {atendente_destino.nome_exibicao} está assumindo. Como posso ajudá-lo?"
        
        # Salvar mensagem no banco
        msg_log = MensagemLog(
            empresa_id=empresa_id,
            whatsapp_number=dados.whatsapp_number,
            direcao="enviada",
            tipo_mensagem="text",
            conteudo=mensagem,
            estado_sessao="sistema"
        )
        db.add(msg_log)
        db.commit()
        
        # Enviar via Celery (MULTI-TENANT: passa empresa_id)
        enviar_mensagem_whatsapp.delay(
            to=dados.whatsapp_number,
            message=mensagem,
            message_type="text",
            empresa_id=empresa_id
        )
        print(f"📤 Mensagem de transferência enviada para {dados.whatsapp_number}")
    except Exception as e:
        print(f"⚠️ Erro ao enviar mensagem de transferência: {e}")

    # Notificar via WebSocket
    try:
        await notify_conversa_transferida(
            empresa_id=empresa_id,
            whatsapp=dados.whatsapp_number,
            de_atendente_id=atendente_id,
            para_atendente_id=dados.atendente_destino_id,
            para_atendente_nome=atendente_destino.nome_exibicao
        )
    except Exception as e:
        print(f"Erro ao notificar via WebSocket: {e}")

    return TransferirConversaResponse(
        sucesso=True,
        mensagem="Conversa transferida com sucesso",
        whatsapp_number=dados.whatsapp_number,
        transferido_para=atendente_destino.nome_exibicao
    )


@router.get("/atendente/metricas", response_model=MetricasAtendenteResponse)
async def obter_metricas_atendente(
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Retorna métricas do painel do atendente

    - Minhas conversas ativas
    - Conversas disponíveis na fila
    - Tempo médio de resposta
    - Total de mensagens enviadas hoje
    - Total de conversas assumidas hoje
    """
    atendente_id, empresa_id = atendente_info

    # Minhas conversas ativas
    minhas_conversas = db.query(func.count(Atendimento.id)).join(
        Cliente, Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        and_(
            Cliente.empresa_id == empresa_id,
            Atendimento.atendente_id == atendente_id,
            Atendimento.status == 'em_atendimento'
        )
    ).scalar() or 0

    # Conversas na fila (disponíveis para assumir)
    fila_total = db.query(func.count(Atendimento.id)).join(
        Cliente, Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        and_(
            Cliente.empresa_id == empresa_id,
            or_(
                Atendimento.status == 'bot',
                Atendimento.status == 'aguardando'
            )
        )
    ).scalar() or 0

    # Tempo médio de resposta (simplificado - pode ser melhorado)
    tempo_medio = 5.0  # TODO: Calcular baseado em mensagens reais

    # Mensagens enviadas hoje pelo atendente
    # Como MensagemLog não tem atendente_id, vamos contar mensagens das conversas do atendente
    hoje = datetime.now().date()

    whatsapps_atendente = db.query(Atendimento.whatsapp_number).filter(
        Atendimento.atendente_id == atendente_id
    ).subquery()

    mensagens_hoje = db.query(func.count(MensagemLog.id)).filter(
        and_(
            MensagemLog.direcao == 'enviada',
            func.date(MensagemLog.timestamp) == hoje,
            MensagemLog.whatsapp_number.in_(whatsapps_atendente)
        )
    ).scalar() or 0

    # Conversas assumidas hoje (atribuidas hoje)
    assumidas_hoje = db.query(func.count(Atendimento.id)).filter(
        and_(
            Atendimento.atendente_id == atendente_id,
            func.date(Atendimento.atribuido_em) == hoje
        )
    ).scalar() or 0

    return MetricasAtendenteResponse(
        minhas_conversas_ativas=minhas_conversas,
        conversas_na_fila=fila_total,
        tempo_medio_resposta_minutos=tempo_medio,
        total_mensagens_enviadas_hoje=mensagens_hoje,
        total_conversas_assumidas_hoje=assumidas_hoje
    )


class EquipeOnlineResponse(BaseModel):
    """Resposta com dados da equipe online"""
    id: int
    nome_exibicao: str
    status: str
    foto_url: Optional[str] = None
    total_chats_ativos: int

    class Config:
        from_attributes = True


class AtendentePerfilResponse(BaseModel):
    """Resposta com perfil do atendente"""
    id: int
    nome_exibicao: str
    email: str
    cpf: Optional[str] = None
    data_nascimento: Optional[str] = None
    foto_url: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class AtualizarPerfilRequest(BaseModel):
    """Request para atualizar perfil"""
    nome_exibicao: Optional[str] = None
    data_nascimento: Optional[str] = None


class TransferirParaEmpresaRequest(BaseModel):
    """Request para transferir conversa para empresa"""
    whatsapp_number: str
    motivo: Optional[str] = None


@router.get("/atendente/equipe-online", response_model=List[EquipeOnlineResponse])
async def listar_equipe_online(
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Lista atendentes da mesma empresa com status online

    - Mostra todos os atendentes (online/offline)
    - Quantidade de chats ativos de cada um

    OTIMIZAÇÃO: Subquery para contar chats (evitar N+1)
    """
    atendente_id, empresa_id = atendente_info

    # Subquery para contar chats ativos por atendente
    chats_ativos_subq = db.query(
        Atendimento.atendente_id,
        func.count(Atendimento.id).label('total_chats')
    ).filter(
        Atendimento.status == 'em_atendimento'
    ).group_by(Atendimento.atendente_id).subquery()

    # Query principal com LEFT JOIN na subquery
    atendentes = db.query(
        Atendente,
        func.coalesce(chats_ativos_subq.c.total_chats, 0).label('total_chats')
    ).outerjoin(
        chats_ativos_subq,
        Atendente.id == chats_ativos_subq.c.atendente_id
    ).filter(
        Atendente.empresa_id == empresa_id
    ).all()

    resultado = []
    for atendente, total_chats in atendentes:
        resultado.append(EquipeOnlineResponse(
            id=atendente.id,
            nome_exibicao=atendente.nome_exibicao,
            status=atendente.status,
            foto_url=atendente.foto_url,
            total_chats_ativos=total_chats
        ))

    # Ordenar: online primeiro, depois por nome
    resultado.sort(key=lambda x: (x.status != 'online', x.nome_exibicao))

    return resultado


@router.get("/atendente/perfil", response_model=AtendentePerfilResponse)
async def obter_meu_perfil(
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Retorna perfil do atendente logado
    """
    atendente_id, empresa_id = atendente_info

    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Atendente não encontrado"
        )

    return AtendentePerfilResponse(
        id=atendente.id,
        nome_exibicao=atendente.nome_exibicao,
        email=atendente.email,
        cpf=atendente.cpf,
        data_nascimento=atendente.data_nascimento.isoformat() if atendente.data_nascimento else None,
        foto_url=atendente.foto_url,
        status=atendente.status
    )


@router.put("/atendente/perfil", response_model=AtendentePerfilResponse)
async def atualizar_meu_perfil(
    dados: AtualizarPerfilRequest,
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Atualiza perfil do atendente logado

    - Pode alterar nome_exibicao e data_nascimento
    - Não pode alterar email, cpf (apenas empresa pode)
    """
    atendente_id, empresa_id = atendente_info

    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    if not atendente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Atendente não encontrado"
        )

    # Atualizar campos permitidos
    if dados.nome_exibicao:
        atendente.nome_exibicao = dados.nome_exibicao

    if dados.data_nascimento:
        from datetime import date
        atendente.data_nascimento = date.fromisoformat(dados.data_nascimento)

    db.commit()
    db.refresh(atendente)

    return AtendentePerfilResponse(
        id=atendente.id,
        nome_exibicao=atendente.nome_exibicao,
        email=atendente.email,
        cpf=atendente.cpf,
        data_nascimento=atendente.data_nascimento.isoformat() if atendente.data_nascimento else None,
        foto_url=atendente.foto_url,
        status=atendente.status
    )


@router.post("/atendente/transferir-empresa")
async def transferir_para_empresa(
    dados: TransferirParaEmpresaRequest,
    atendente_info: CurrentAtendente,
    db: Session = Depends(get_db)
):
    """
    Transfere conversa do atendente para o dono da empresa

    - Remove atendente_id
    - Muda status para 'aguardando'
    - Adiciona nota interna
    """
    atendente_id, empresa_id = atendente_info

    # Buscar conversa
    atendimento = db.query(Atendimento).join(
        Cliente, Cliente.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        and_(
            Atendimento.whatsapp_number == dados.whatsapp_number,
            Cliente.empresa_id == empresa_id
        )
    ).first()

    if not atendimento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversa não encontrada"
        )

    # Verificar se é o dono da conversa
    if atendimento.atendente_id != atendente_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você só pode transferir suas próprias conversas"
        )

    # Buscar dados do atendente
    atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()

    # Transferir para empresa (remove atendente e coloca em aguardando)
    atendimento.atendente_id = None
    atendimento.status = 'aguardando'

    # Adicionar nota interna
    nota = f'Transferida para empresa por {atendente.nome_exibicao}'
    if dados.motivo:
        nota += f' - Motivo: {dados.motivo}'

    if atendimento.notas_internas:
        atendimento.notas_internas += f'\n\n[{datetime.now().strftime("%Y-%m-%d %H:%M")}] {nota}'
    else:
        atendimento.notas_internas = f'[{datetime.now().strftime("%Y-%m-%d %H:%M")}] {nota}'

    db.commit()

    return {
        "sucesso": True,
        "mensagem": "Conversa transferida para a empresa",
        "whatsapp_number": dados.whatsapp_number
    }

# ========== UPLOAD DE FOTO ==========

@router.post("/atendente/foto")
async def upload_foto_perfil(
    file: UploadFile = File(...),
    authorization: str = Header(...),
    db: Session = Depends(get_db)
):
    """
    Upload de foto de perfil do atendente
    
    Aceita: JPG, JPEG, PNG, GIF
    Tamanho máximo: 5MB
    """
    try:
        # Validar atendente
        atendente_id, empresa_id = validar_permissao_atendente(authorization, db)
        
        # Validar tipo de arquivo
        allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="Tipo de arquivo não permitido. Use JPG, PNG ou GIF."
            )
        
        # Validar tamanho (5MB)
        file_size = 0
        chunk_size = 1024 * 1024  # 1MB
        for chunk in iter(lambda: file.file.read(chunk_size), b''):
            file_size += len(chunk)
            if file_size > 5 * 1024 * 1024:  # 5MB
                raise HTTPException(
                    status_code=400,
                    detail="Arquivo muito grande. Tamanho máximo: 5MB"
                )
        
        # Reset file pointer
        file.file.seek(0)
        
        # Criar diretório de uploads se não existir
        upload_dir = Path("uploads/avatars")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Gerar nome único
        file_extension = file.filename.split(".")[-1]
        unique_filename = f"atendente_{atendente_id}_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = upload_dir / unique_filename
        
        # Salvar arquivo
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Atualizar banco de dados
        atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()
        if not atendente:
            raise HTTPException(status_code=404, detail="Atendente não encontrado")
        
        # Deletar foto antiga se existir
        if atendente.foto_url:
            old_path = Path(atendente.foto_url)
            if old_path.exists():
                old_path.unlink()
        
        # Atualizar URL da foto
        atendente.foto_url = str(file_path)
        db.commit()
        
        return {
            "sucesso": True,
            "mensagem": "Foto atualizada com sucesso",
            "foto_url": f"/uploads/avatars/{unique_filename}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erro ao fazer upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/atendente/foto")
async def remover_foto_perfil(
    authorization: str = Header(...),
    db: Session = Depends(get_db)
):
    """
    Remove a foto de perfil do atendente
    """
    try:
        # Validar atendente
        atendente_id, empresa_id = validar_permissao_atendente(authorization, db)
        
        atendente = db.query(Atendente).filter(Atendente.id == atendente_id).first()
        if not atendente:
            raise HTTPException(status_code=404, detail="Atendente não encontrado")
        
        # Deletar arquivo físico
        if atendente.foto_url:
            file_path = Path(atendente.foto_url)
            if file_path.exists():
                file_path.unlink()
        
        # Limpar banco
        atendente.foto_url = None
        db.commit()
        
        return {
            "sucesso": True,
            "mensagem": "Foto removida com sucesso"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erro ao remover foto: {e}")
        raise HTTPException(status_code=500, detail=str(e))
