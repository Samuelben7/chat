from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid
import asyncio
import logging

from app.database.database import get_db
from app.models.models import MensagemLog, ChatSessao, Atendimento, Empresa, Cliente
from app.schemas.schemas import MensagemCreate, MensagemResponse
from app.services.whatsapp import WhatsAppService
from app.core.dependencies import CurrentUser, EmpresaIdFromToken

router = APIRouter()
logger = logging.getLogger(__name__)

# Modo mock para quando API do WhatsApp não estiver disponível
WHATSAPP_API_MOCK = False  # API liberada! Enviando mensagens reais


@router.post("/mensagens", response_model=MensagemResponse)
async def enviar_mensagem(
    mensagem: MensagemCreate,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Envia uma mensagem via WhatsApp API.
    Regras:
    - Atendente: só envia em chats que são seus (atendente_id = seu id)
    - Empresa: só envia se não há atendente responsável (ou ela mesma assumiu)
    """
    # Verificar atendimento ativo
    atendimento = db.query(Atendimento).filter(
        Atendimento.whatsapp_number == mensagem.whatsapp_number,
        Atendimento.empresa_id == empresa_id,
        Atendimento.status == "em_atendimento"
    ).order_by(Atendimento.iniciado_em.desc()).first()

    if atendimento:
        if user.role == "atendente":
            # Atendente só pode enviar no próprio chat
            if atendimento.atendente_id != user.atendente_id:
                raise HTTPException(
                    status_code=403,
                    detail="Esta conversa está sendo atendida por outro atendente."
                )
        elif user.role == "empresa":
            # Empresa só pode enviar se NÃO há atendente responsável
            if atendimento.atendente_id is not None:
                raise HTTPException(
                    status_code=403,
                    detail="Esta conversa está sendo atendida por um atendente. Clique em 'Assumir' para enviar mensagens."
                )

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

            # Enviar mensagem via WhatsApp API (com resposta contextual se solicitado)
            message_id = await whatsapp_service.send_text_message(
                to=mensagem.whatsapp_number,
                text=mensagem.conteudo,
                context_message_id=mensagem.context_message_id,
            )

        # Montar dados_extras: base + reply_to se houver
        dados_extras_final = dict(mensagem.dados_extras or {})
        if mensagem.reply_to_content:
            dados_extras_final["reply_to_content"] = mensagem.reply_to_content
        if mensagem.reply_to_direcao:
            dados_extras_final["reply_to_direcao"] = mensagem.reply_to_direcao

        # Salvar no log (tanto para mock quanto real)
        mensagem_log = MensagemLog(
            empresa_id=1,  # TODO: pegar do JWT quando tiver multi-tenant
            whatsapp_number=mensagem.whatsapp_number,
            message_id=message_id,
            direcao="enviada",
            tipo_mensagem=mensagem.tipo_mensagem,
            conteudo=mensagem.conteudo,
            dados_extras=dados_extras_final,
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


@router.patch("/mensagens/{whatsapp_number}/marcar-todas-lidas")
async def marcar_todas_lidas(
    whatsapp_number: str,
    db: Session = Depends(get_db)
):
    """
    Marca todas as mensagens recebidas de um número como lidas no DB
    e envia read receipts para a Meta API para a mensagem mais recente.
    Marcar a mais recente já faz a Meta marcar as anteriores também.
    """
    # Buscar a mensagem recebida mais recente com message_id válido (para notificar Meta)
    ultima_msg = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.direcao == "recebida",
        MensagemLog.lida == False,
        MensagemLog.message_id.isnot(None),
    ).order_by(MensagemLog.timestamp.desc()).first()

    # Atualizar todas no DB
    updated = db.query(MensagemLog).filter(
        MensagemLog.whatsapp_number == whatsapp_number,
        MensagemLog.direcao == "recebida",
        MensagemLog.lida == False
    ).update({"lida": True})
    db.commit()

    # Notificar Meta API (fire-and-forget, não bloqueia se falhar)
    if ultima_msg and ultima_msg.message_id:
        try:
            empresa = db.query(Empresa).filter(Empresa.ativa == True).first()
            if empresa:
                ws = WhatsAppService(empresa)
                await ws.mark_as_read(ultima_msg.message_id)
        except Exception as e:
            logger.warning(f"Falha ao enviar read receipt para Meta ({ultima_msg.message_id}): {e}")

    return {
        "status": "success",
        "whatsapp_number": whatsapp_number,
        "mensagens_marcadas": updated
    }


# ─── Envio em Massa (Mensagens dentro da janela 24h) ──────────────────────────

class EnvioMassaRequest(BaseModel):
    mensagem: str
    tipo: str = "text"  # text, image, video, document
    media_url: Optional[str] = None
    whatsapp_numbers: Optional[List[str]] = None  # Lista manual de números
    lista_id: Optional[int] = None  # ID de lista de contatos
    apenas_janela_24h: bool = True  # Filtrar apenas contatos dentro da janela


class ContatoJanela24h(BaseModel):
    whatsapp_number: str
    nome: Optional[str] = None
    ultima_mensagem_recebida: Optional[str] = None
    dentro_janela: bool = True


@router.get("/mensagens/contatos-janela-24h")
async def listar_contatos_janela_24h(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """
    Lista contatos que enviaram mensagem nas últimas 24h (dentro da janela da Meta).
    Esses contatos podem receber mensagens livres (não-template).
    """
    limite_24h = datetime.now(timezone.utc) - timedelta(hours=24)

    # Subquery: última mensagem RECEBIDA por número
    subq = db.query(
        MensagemLog.whatsapp_number,
        func.max(MensagemLog.timestamp).label('ultima_recebida')
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == 'recebida',
    ).group_by(MensagemLog.whatsapp_number).subquery()

    # Filtrar apenas os que a última mensagem recebida foi < 24h atrás
    resultados = db.query(
        subq.c.whatsapp_number,
        subq.c.ultima_recebida,
    ).filter(
        subq.c.ultima_recebida >= limite_24h,
    ).order_by(subq.c.ultima_recebida.desc()).all()

    contatos = []
    for row in resultados:
        # Buscar nome do cliente
        cliente = db.query(Cliente).filter(
            Cliente.empresa_id == empresa_id,
            Cliente.whatsapp_number == row.whatsapp_number
        ).first()

        contatos.append({
            "whatsapp_number": row.whatsapp_number,
            "nome": cliente.nome_completo if cliente else None,
            "ultima_mensagem_recebida": row.ultima_recebida.isoformat() if row.ultima_recebida else None,
            "dentro_janela": True,
            "minutos_restantes": max(0, int((row.ultima_recebida + timedelta(hours=24) - datetime.now(timezone.utc)).total_seconds() / 60)) if row.ultima_recebida else 0,
        })

    return {
        "total": len(contatos),
        "contatos": contatos,
    }


@router.post("/mensagens/envio-massa")
async def enviar_mensagem_massa(
    dados: EnvioMassaRequest,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """
    Envia mensagem para múltiplos contatos dentro da janela de 24h da Meta.
    Mensagens livres (não-template) só podem ser enviadas para contatos
    que interagiram nas últimas 24 horas.
    """
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode enviar em massa")

    if not dados.mensagem.strip():
        raise HTTPException(status_code=400, detail="Mensagem não pode ser vazia")

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    # Coletar números
    numbers = list(dados.whatsapp_numbers or [])

    if dados.lista_id:
        from app.models.models import ListaContatosMembro
        membros = db.query(ListaContatosMembro).filter(
            ListaContatosMembro.lista_id == dados.lista_id
        ).all()
        for m in membros:
            if m.whatsapp_number not in numbers:
                numbers.append(m.whatsapp_number)

    if not numbers:
        raise HTTPException(status_code=400, detail="Nenhum número para enviar")

    # Filtrar por janela de 24h se solicitado
    if dados.apenas_janela_24h:
        limite_24h = datetime.now(timezone.utc) - timedelta(hours=24)
        # Buscar números que receberam mensagem nas últimas 24h
        numeros_na_janela = db.query(MensagemLog.whatsapp_number).filter(
            MensagemLog.empresa_id == empresa_id,
            MensagemLog.direcao == 'recebida',
            MensagemLog.timestamp >= limite_24h,
            MensagemLog.whatsapp_number.in_(numbers),
        ).distinct().all()
        numeros_na_janela_set = {r[0] for r in numeros_na_janela}
        numeros_fora = [n for n in numbers if n not in numeros_na_janela_set]
        numbers = [n for n in numbers if n in numeros_na_janela_set]

        if not numbers:
            raise HTTPException(
                status_code=400,
                detail=f"Nenhum dos {len(numeros_fora)} contatos está dentro da janela de 24h"
            )

    # Enviar mensagens
    whatsapp = WhatsAppService(empresa)
    resultados = []
    enviados = 0
    erros = 0

    for number in numbers:
        try:
            if dados.tipo == "text":
                msg_id = await whatsapp.send_text_message(number, dados.mensagem)
            elif dados.tipo in ("image", "video", "document") and dados.media_url:
                msg_id = await whatsapp.send_media_message(
                    to=number,
                    media_type=dados.tipo,
                    media_url=dados.media_url,
                    caption=dados.mensagem if dados.mensagem else None,
                )
            else:
                msg_id = await whatsapp.send_text_message(number, dados.mensagem)

            # Log no banco
            log = MensagemLog(
                empresa_id=empresa_id,
                whatsapp_number=number,
                message_id=msg_id,
                direcao="enviada",
                tipo_mensagem=dados.tipo,
                conteudo=dados.mensagem,
                dados_extras={"envio_massa": True, "media_url": dados.media_url},
                timestamp=datetime.now(timezone.utc),
            )
            db.add(log)
            resultados.append({"success": True, "whatsapp_number": number, "message_id": msg_id})
            enviados += 1

            # Rate limit: ~20 msgs/s para não sobrecarregar
            await asyncio.sleep(0.05)

        except Exception as e:
            logger.error(f"Erro envio massa para {number}: {e}")
            resultados.append({"success": False, "whatsapp_number": number, "error": str(e)})
            erros += 1

    db.commit()

    return {
        "total": len(numbers),
        "enviados": enviados,
        "erros": erros,
        "fora_janela": len(numeros_fora) if dados.apenas_janela_24h else 0,
        "resultados": resultados,
    }
