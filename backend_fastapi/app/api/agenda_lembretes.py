"""
Configuração de lembretes automáticos de agendamento.
Suporta mensagem interativa (janela 24h) e template Meta (fora da janela).
Parâmetros dinâmicos são resolvidos a partir dos dados do cliente no banco.
"""
import re
import logging
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.models import (
    AgendaAgendamento, AgendaLembreteConfig, AgendaSlot,
    Cliente, Especialidade, Empresa, ClienteValorCustom
)
from app.core.dependencies import CurrentUser, EmpresaIdFromToken
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

_PARAM_RE = re.compile(r'\{(\w+(?::\w+)?)\}')


def _resolver_parametros(template_str: str, ag: AgendaAgendamento, cliente: Optional[Cliente]) -> str:
    """
    Substitui parâmetros dinâmicos no texto do template.

    Parâmetros suportados:
      {nome_cliente}       → cliente.nome_completo
      {whatsapp}           → ag.whatsapp_number
      {data_agendamento}   → data formatada dd/mm/aaaa
      {hora_agendamento}   → hora_inicio do slot
      {especialidade}      → especialidade.nome
      {valor}              → R$ XX,XX formatado
      {campo_custom:X}     → ClienteValorCustom.valor onde campo.nome=X
    """
    slot = ag.slot
    esp = ag.especialidade

    def substituir(m):
        param = m.group(1)
        if param == 'nome_cliente':
            return (cliente.nome_completo if cliente else ag.nome_cliente) or 'Cliente'
        if param == 'whatsapp':
            return ag.whatsapp_number or ''
        if param == 'data_agendamento':
            return slot.data.strftime('%d/%m/%Y') if slot else ''
        if param == 'hora_agendamento':
            return slot.hora_inicio if slot else ''
        if param == 'especialidade':
            return esp.nome if esp else ''
        if param == 'valor':
            if esp and esp.valor:
                return f"R$ {esp.valor:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
            return ''
        if param.startswith('campo_custom:') and cliente:
            campo_nome = param.split(':', 1)[1]
            valor_custom = next(
                (cv.valor for cv in (cliente.campos_custom_valores or [])
                 if cv.campo and cv.campo.nome == campo_nome), None
            )
            return valor_custom or ''
        return m.group(0)  # mantém original se não reconhecido

    return _PARAM_RE.sub(substituir, template_str)


def _resolver_componentes(componentes: list, ag: AgendaAgendamento, cliente: Optional[Cliente]) -> list:
    """Substitui parâmetros em todos os textos dos componentes do template."""
    resolvidos = []
    for comp in componentes:
        comp_copia = dict(comp)
        if 'parameters' in comp_copia:
            params_resolvidos = []
            for param in comp_copia['parameters']:
                p = dict(param)
                if p.get('type') == 'text' and 'text' in p:
                    p['text'] = _resolver_parametros(p['text'], ag, cliente)
                params_resolvidos.append(p)
            comp_copia['parameters'] = params_resolvidos
        resolvidos.append(comp_copia)
    return resolvidos


async def _janela_24h_aberta(empresa: Empresa, whatsapp_number: str) -> bool:
    """Verifica se houve mensagem nas últimas 24h (janela de sessão aberta)."""
    try:
        from app.core.redis_client import redis_cache
        key = f"empresa:{empresa.id}:janela_24h:{whatsapp_number}"
        return bool(redis_cache.client.exists(key))
    except Exception:
        return False


async def _enviar_mensagem_interativa(empresa: Empresa, whatsapp_number: str, payload: dict) -> bool:
    """Envia mensagem interativa via WhatsApp Cloud API."""
    import httpx
    url = f"https://graph.facebook.com/v21.0/{empresa.phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {empresa.whatsapp_token}", "Content-Type": "application/json"}
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": whatsapp_number,
        **payload,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        return resp.status_code == 200


async def _enviar_template(empresa: Empresa, whatsapp_number: str,
                            template_nome: str, idioma: str, componentes: list) -> bool:
    """Envia template aprovado via WhatsApp Cloud API."""
    import httpx
    url = f"https://graph.facebook.com/v21.0/{empresa.phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {empresa.whatsapp_token}", "Content-Type": "application/json"}
    body = {
        "messaging_product": "whatsapp",
        "to": whatsapp_number,
        "type": "template",
        "template": {
            "name": template_nome,
            "language": {"code": idioma or "pt_BR"},
            "components": componentes,
        },
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        return resp.status_code == 200


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/agenda/lembrete-config")
async def get_lembrete_config(
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Retorna configuração de lembrete da empresa."""
    cfg = db.query(AgendaLembreteConfig).filter(
        AgendaLembreteConfig.empresa_id == empresa_id
    ).first()
    if not cfg:
        return {"empresa_id": empresa_id, "ativo": False}
    return {
        "id": cfg.id,
        "empresa_id": cfg.empresa_id,
        "mensagem_interativa": cfg.mensagem_interativa,
        "mensagem_interativa_nome": cfg.mensagem_interativa_nome,
        "template_nome": cfg.template_nome,
        "template_idioma": cfg.template_idioma,
        "template_componentes": cfg.template_componentes or [],
        "ativo": cfg.ativo,
        "atualizado_em": cfg.atualizado_em.isoformat() if cfg.atualizado_em else None,
    }


@router.put("/agenda/lembrete-config")
async def salvar_lembrete_config(
    dados: dict,
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Salva (upsert) configuração de lembrete."""
    cfg = db.query(AgendaLembreteConfig).filter(
        AgendaLembreteConfig.empresa_id == empresa_id
    ).first()
    if not cfg:
        cfg = AgendaLembreteConfig(empresa_id=empresa_id)
        db.add(cfg)

    campos = [
        'mensagem_interativa', 'mensagem_interativa_nome',
        'template_nome', 'template_idioma', 'template_componentes', 'ativo'
    ]
    for campo in campos:
        if campo in dados:
            setattr(cfg, campo, dados[campo])

    cfg.atualizado_em = datetime.utcnow()
    db.commit()
    return {"sucesso": True}


@router.post("/agenda/agendamentos/{agendamento_id}/lembrete")
async def enviar_lembrete_manual(
    agendamento_id: int,
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Envia lembrete manual imediato para um agendamento específico."""
    ag = db.query(AgendaAgendamento).filter(
        AgendaAgendamento.id == agendamento_id,
        AgendaAgendamento.empresa_id == empresa_id
    ).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    cfg = db.query(AgendaLembreteConfig).filter(
        AgendaLembreteConfig.empresa_id == empresa_id
    ).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Configure o lembrete primeiro em Configurações")

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa or not empresa.whatsapp_token:
        raise HTTPException(status_code=400, detail="WhatsApp não configurado")

    cliente = db.query(Cliente).filter(Cliente.id == ag.cliente_id).first() if ag.cliente_id else None

    janela_aberta = await _janela_24h_aberta(empresa, ag.whatsapp_number)
    enviado = False

    if janela_aberta and cfg.mensagem_interativa:
        enviado = await _enviar_mensagem_interativa(empresa, ag.whatsapp_number, cfg.mensagem_interativa)
    elif cfg.template_nome:
        componentes = _resolver_componentes(cfg.template_componentes or [], ag, cliente)
        enviado = await _enviar_template(empresa, ag.whatsapp_number,
                                          cfg.template_nome, cfg.template_idioma or 'pt_BR', componentes)

    if enviado:
        ag.lembrete_enviado = True
        db.commit()

    return {
        "enviado": enviado,
        "canal": "interativo" if (janela_aberta and cfg.mensagem_interativa) else "template",
        "whatsapp_number": ag.whatsapp_number,
    }
