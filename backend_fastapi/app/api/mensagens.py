from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.database.database import get_db
from app.models.models import MensagemLog, ChatSessao, Atendimento, Empresa
from app.schemas.schemas import MensagemCreate, MensagemResponse
from app.services.whatsapp import WhatsAppService

router = APIRouter()

# Modo mock para quando API do WhatsApp não estiver disponível
WHATSAPP_API_MOCK = False  # API liberada! Enviando mensagens reais


@router.post("/mensagens", response_model=MensagemResponse)
async def enviar_mensagem(
    mensagem: MensagemCreate,
    db: Session = Depends(get_db)
):
    """
    Envia uma mensagem via WhatsApp API.

    Modo MOCK ativo: salva apenas no banco, não envia pela API real.
    Quando API for liberada, mude WHATSAPP_API_MOCK = False.
    """
    try:
        message_id = None

        # Modo MOCK: não tenta enviar pela API (para quando API não está liberada)
        if WHATSAPP_API_MOCK:
            # Gera ID fake para simular envio
            message_id = f"wamid.mock_{uuid.uuid4().hex[:16]}"
            print(f"📱 [MOCK] Mensagem simulada para {mensagem.whatsapp_number}: {mensagem.conteudo[:50]}")

        # Modo REAL: envia pela API do WhatsApp
        else:
            # Buscar empresa (por enquanto usa empresa_id=1, depois pegar do JWT)
            empresa = db.query(Empresa).filter(Empresa.id == 1).first()

            if not empresa:
                raise HTTPException(status_code=404, detail="Empresa não encontrada")

            # Inicializar serviço com credenciais da empresa
            whatsapp_service = WhatsAppService(empresa)

            # Enviar mensagem via WhatsApp API
            message_id = await whatsapp_service.send_text_message(
                to=mensagem.whatsapp_number,
                text=mensagem.conteudo
            )

        # Salvar no log (tanto para mock quanto real)
        mensagem_log = MensagemLog(
            empresa_id=1,  # TODO: pegar do JWT quando tiver multi-tenant
            whatsapp_number=mensagem.whatsapp_number,
            message_id=message_id,
            direcao="enviada",
            tipo_mensagem=mensagem.tipo_mensagem,
            conteudo=mensagem.conteudo,
            dados_extras=mensagem.dados_extras or {},
            timestamp=datetime.now(timezone.utc),
            lida=False
        )
        db.add(mensagem_log)

        # Atualizar atendimento
        atendimento = db.query(Atendimento).filter(
            Atendimento.whatsapp_number == mensagem.whatsapp_number,
            Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])
        ).order_by(Atendimento.iniciado_em.desc()).first()

        if atendimento:
            atendimento.ultima_mensagem_em = datetime.now(timezone.utc)

        db.commit()
        db.refresh(mensagem_log)

        return mensagem_log

    except Exception as e:
        db.rollback()
        print(f"❌ Erro enviando mensagem: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mensagens/{whatsapp_number}", response_model=List[MensagemResponse])
async def listar_mensagens(
    whatsapp_number: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Lista mensagens de um número específico (ordenadas por data crescente).
    """
    mensagens = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.empresa_id == 1  # TODO: pegar do JWT
    ).order_by(MensagemLog.timestamp.asc()).limit(limit).offset(offset).all()

    return mensagens


@router.patch("/mensagens/{message_id}/marcar-lida")
async def marcar_mensagem_lida(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Marca mensagem como lida.
    """
    mensagem = db.query(MensagemLog).filter(
        MensagemLog.message_id == message_id
    ).first()

    if not mensagem:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    mensagem.lida = True
    db.commit()

    return {"status": "success", "message_id": message_id}


@router.get("/mensagens/{whatsapp_number}/nao-lidas")
async def contar_nao_lidas(
    whatsapp_number: str,
    db: Session = Depends(get_db)
):
    """
    Conta mensagens não lidas de um número.
    """
    count = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.direcao == "recebida",
        MensagemLog.lida == False
    ).count()

    return {"whatsapp_number": whatsapp_number, "nao_lidas": count}
