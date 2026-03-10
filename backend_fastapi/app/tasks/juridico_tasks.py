"""
Tasks Celery para o módulo jurídico:
- Verificação periódica de processos via DataJud
- Geração de resumo IA e notificação WhatsApp ao cliente
"""
import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Optional

from app.tasks.celery_app import celery_app
from app.database.database import SessionLocal
from app.models.models import ProcessoJudicial, MovimentacaoProcesso, Cliente, Empresa
from app.services import datajud as datajud_service

logger = logging.getLogger("juridico_tasks")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _resumir_com_ia(descricao: str, classe: str = "", tribunal: str = "") -> str:
    """
    Gera resumo em linguagem simples via Claude Haiku.
    Síncrono (chamado dentro de task Celery).
    """
    try:
        import anthropic
        client = anthropic.Anthropic()

        contexto = ""
        if classe:
            contexto += f"Tipo de processo: {classe}. "
        if tribunal:
            contexto += f"Tribunal: {tribunal.upper()}. "

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": (
                    f"{contexto}"
                    f"Movimentação judicial: \"{descricao}\"\n\n"
                    "Explique essa movimentação em 1-2 frases simples para o cliente "
                    "(leigo, sem termos técnicos jurídicos). Seja direto e tranquilizador."
                )
            }]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Falha ao gerar resumo IA: {e}")
        return descricao  # fallback: usa descrição original


def _enviar_whatsapp(empresa: Empresa, numero: str, texto: str):
    """Envia mensagem WhatsApp usando a infra existente."""
    try:
        from app.tasks.tasks import enviar_mensagem_whatsapp
        enviar_mensagem_whatsapp.delay(
            to=numero,
            message=texto,
            message_type="text",
            empresa_id=empresa.id,
        )
    except Exception as e:
        logger.error(f"Erro ao enfileirar WhatsApp para {numero}: {e}")


# ─── Task principal ────────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.juridico_tasks.verificar_processos_periodico",
    bind=True,
    max_retries=2,
)
def verificar_processos_periodico(self):
    """
    Verifica todos os processos ativos no DataJud e notifica clientes
    sobre novas movimentações.
    Executado periodicamente pelo Celery Beat.
    """
    db = SessionLocal()
    total_verificados = 0
    total_novas_movs = 0

    try:
        processos = db.query(ProcessoJudicial).filter(
            ProcessoJudicial.ativo == True
        ).all()

        logger.info(f"🔍 Verificando {len(processos)} processos no DataJud...")

        for processo in processos:
            try:
                novas = _verificar_processo(db, processo)
                total_novas_movs += novas
                total_verificados += 1
            except Exception as e:
                logger.error(f"Erro ao verificar processo {processo.numero_cnj}: {e}")
                continue

        logger.info(
            f"✅ Verificação concluída: {total_verificados} processos, "
            f"{total_novas_movs} novas movimentações"
        )

    except Exception as e:
        logger.error(f"Erro na task verificar_processos_periodico: {e}")
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()

    return {"verificados": total_verificados, "novas_movimentacoes": total_novas_movs}


def _verificar_processo(db, processo: ProcessoJudicial) -> int:
    """
    Verifica um único processo. Retorna número de novas movimentações encontradas.
    """
    # Consulta DataJud de forma síncrona (dentro do worker Celery)
    hit = asyncio.get_event_loop().run_until_complete(
        datajud_service.buscar_processo(processo.numero_cnj, processo.indice_datajud)
    )

    processo.ultima_verificacao = datetime.utcnow()

    if not hit:
        db.commit()
        return 0

    # Atualiza metadados do processo
    dados = datajud_service.extrair_dados_processo(hit)
    for campo, valor in dados.items():
        if valor and campo != "partes":
            setattr(processo, campo, valor)
    if dados.get("partes"):
        processo.partes = dados["partes"]

    # Extrai movimentações
    movimentacoes = datajud_service.extrair_movimentacoes(hit, processo.numero_cnj)

    # Hashes já registrados para este processo
    hashes_existentes = {
        m.datajud_hash
        for m in db.query(MovimentacaoProcesso.datajud_hash)
        .filter(MovimentacaoProcesso.processo_id == processo.id)
        .all()
    }

    novas = 0
    empresa = db.query(Empresa).filter(Empresa.id == processo.empresa_id).first()
    cliente = db.query(Cliente).filter(Cliente.id == processo.cliente_id).first() if processo.cliente_id else None

    for mov_data in movimentacoes:
        hash_mov = mov_data["datajud_hash"]
        if hash_mov in hashes_existentes:
            continue

        # Gera resumo IA
        resumo = _resumir_com_ia(
            mov_data["descricao"],
            classe=processo.classe or "",
            tribunal=processo.tribunal or "",
        )

        nova_mov = MovimentacaoProcesso(
            processo_id=processo.id,
            data_movimentacao=mov_data["data_movimentacao"],
            codigo_nacional=mov_data.get("codigo_nacional"),
            descricao=mov_data["descricao"],
            resumo_ia=resumo,
            datajud_hash=hash_mov,
            notificado_cliente=False,
        )
        db.add(nova_mov)
        db.flush()

        # Notifica cliente via WhatsApp se configurado
        if processo.notificar_cliente and cliente and cliente.whatsapp_number and empresa:
            data_fmt = mov_data["data_movimentacao"].strftime("%d/%m/%Y")
            mensagem = (
                f"⚖️ *Atualização do seu processo*\n\n"
                f"📋 Processo: `{processo.numero_cnj}`\n"
                f"📅 Data: {data_fmt}\n\n"
                f"📌 {resumo}\n\n"
                f"_Para mais informações, fale com seu advogado._"
            )
            _enviar_whatsapp(empresa, cliente.whatsapp_number, mensagem)
            nova_mov.notificado_cliente = True
            nova_mov.notificado_em = datetime.utcnow()

        # Atualiza data da última movimentação no processo
        if not processo.ultima_movimentacao_data or mov_data["data_movimentacao"] > processo.ultima_movimentacao_data:
            processo.ultima_movimentacao_data = mov_data["data_movimentacao"]

        novas += 1

    db.commit()
    return novas


# ─── Task manual: verificar processo específico ───────────────────────────────

@celery_app.task(name="app.tasks.juridico_tasks.verificar_processo_agora")
def verificar_processo_agora(processo_id: int):
    """Força verificação imediata de um processo específico (acionado manualmente)."""
    db = SessionLocal()
    try:
        processo = db.query(ProcessoJudicial).filter(
            ProcessoJudicial.id == processo_id
        ).first()
        if not processo:
            return {"erro": "Processo não encontrado"}

        novas = _verificar_processo(db, processo)
        return {"processo_id": processo_id, "novas_movimentacoes": novas}
    finally:
        db.close()
