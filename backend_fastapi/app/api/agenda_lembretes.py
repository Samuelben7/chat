"""
Configuração de lembretes automáticos de agendamento.

O empresário seleciona:
  - Uma mensagem interativa já salva em Envios em Massa (ModeloMensagem)
    e mapeia cada variável {} para um campo real do banco (nome, horário, etc.)
  - Um template Meta já aprovado (MessageTemplate)
    e mapeia cada {{N}} para um campo real do banco

Quando o lembrete é disparado (manual ou automático via Celery Beat):
  - Se cliente está na janela 24h → envia a mensagem interativa com variáveis resolvidas
  - Se não → envia o template aprovado com parâmetros resolvidos
"""
import re
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.models import (
    AgendaAgendamento, AgendaLembreteConfig,
    Cliente, Empresa, ModeloMensagem, MessageTemplate
)
from app.core.dependencies import CurrentUser, EmpresaIdFromToken

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Campos disponíveis como variáveis ───────────────────────────────────────

CAMPOS_DISPONÍVEIS = [
    ('nome_cliente',     'Nome do cliente'),
    ('hora_agendamento', 'Hora do agendamento'),
    ('data_agendamento', 'Data do agendamento'),
    ('especialidade',    'Especialidade/Procedimento'),
    ('valor',            'Valor do procedimento'),
    ('whatsapp',         'WhatsApp do cliente'),
]


# ─── Resolução de valores ─────────────────────────────────────────────────────

def _get_field_value(data_field: str, ag: AgendaAgendamento, cliente: Optional[Cliente]) -> str:
    """Resolve um nome de campo para o valor real do agendamento/cliente."""
    slot = ag.slot
    esp = ag.especialidade

    if data_field == 'nome_cliente':
        return (cliente.nome_completo if cliente else ag.nome_cliente) or 'Cliente'
    if data_field == 'hora_agendamento':
        return slot.hora_inicio if slot else ''
    if data_field == 'data_agendamento':
        return slot.data.strftime('%d/%m/%Y') if slot else ''
    if data_field == 'especialidade':
        return esp.nome if esp else ''
    if data_field == 'valor':
        if esp and esp.valor:
            return f"R$ {esp.valor:.2f}".replace('.', ',')
        return ''
    if data_field == 'whatsapp':
        return ag.whatsapp_number or ''
    if data_field.startswith('campo_custom:') and cliente:
        campo_nome = data_field.split(':', 1)[1]
        for cv in (cliente.campos_custom_valores or []):
            if cv.campo and cv.campo.nome == campo_nome:
                return cv.valor or ''
    return ''


def _resolver_modelo(modelo: ModeloMensagem, modelo_params: list,
                     ag: AgendaAgendamento, cliente: Optional[Cliente]) -> str:
    """Substitui cada {} no texto do modelo pelo campo mapeado."""
    texto = modelo.mensagem or ''
    for campo in (modelo_params or []):
        valor = _get_field_value(campo, ag, cliente)
        texto = texto.replace('{}', valor, 1)
    return texto


def _construir_payload_modelo(modelo: ModeloMensagem, texto_resolvido: str) -> dict:
    """Constrói o payload WhatsApp a partir do tipo do ModeloMensagem."""
    if modelo.tipo == 'text':
        return {"type": "text", "text": {"body": texto_resolvido}}

    if modelo.tipo == 'image':
        payload: dict = {"type": "image", "image": {}}
        if modelo.media_url:
            payload["image"]["link"] = modelo.media_url
        if texto_resolvido:
            payload["image"]["caption"] = texto_resolvido
        return payload

    if modelo.tipo in ('button', 'list'):
        interactive: dict = {
            "type": "button" if modelo.tipo == 'button' else "list",
            "body": {"text": texto_resolvido},
        }
        if modelo.header:
            interactive["header"] = {"type": "text", "text": modelo.header}
        if modelo.footer:
            interactive["footer"] = {"text": modelo.footer}
        if modelo.tipo == 'button' and modelo.buttons:
            interactive["action"] = {
                "buttons": [
                    {"type": "reply", "reply": {"id": b.get("id", f"btn_{i}"), "title": b["title"]}}
                    for i, b in enumerate(modelo.buttons)
                ]
            }
        elif modelo.tipo == 'list' and modelo.sections:
            interactive["action"] = {
                "button": modelo.button_text or "Ver opções",
                "sections": modelo.sections,
            }
        return {"type": "interactive", "interactive": interactive}

    # fallback
    return {"type": "text", "text": {"body": texto_resolvido}}


def _construir_componentes_template(template_components: list, template_params: dict,
                                    ag: AgendaAgendamento, cliente: Optional[Cliente]) -> list:
    """Constrói os componentes da API Meta substituindo {{N}} pelos valores mapeados."""
    resultado = []
    for comp in template_components:
        tipo = comp.get('type', '').upper()
        if tipo in ('BODY', 'HEADER'):
            texto = comp.get('text', '')
            nums = sorted(set(re.findall(r'\{\{(\d+)\}\}', texto)), key=int)
            if nums:
                params_list = []
                for n in nums:
                    campo = (template_params or {}).get(str(n), '')
                    valor = _get_field_value(campo, ag, cliente) if campo else ''
                    params_list.append({"type": "text", "text": valor})
                resultado.append({"type": tipo.lower(), "parameters": params_list})
    return resultado


# ─── WhatsApp helpers ─────────────────────────────────────────────────────────

async def _janela_24h_aberta(empresa_id: int, whatsapp_number: str) -> bool:
    try:
        from app.core.redis_client import redis_cache
        return bool(redis_cache.client.exists(f"empresa:{empresa_id}:janela_24h:{whatsapp_number}"))
    except Exception:
        return False


async def _enviar_payload(empresa: Empresa, whatsapp_number: str, payload: dict) -> bool:
    import httpx
    url = f"https://graph.facebook.com/v21.0/{empresa.phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {empresa.whatsapp_token}", "Content-Type": "application/json"}
    body = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": whatsapp_number, **payload}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            logger.warning(f"Falha ao enviar payload para {whatsapp_number}: {resp.text[:200]}")
        return resp.status_code == 200


async def _enviar_template_api(empresa: Empresa, whatsapp_number: str,
                                template_nome: str, idioma: str, componentes: list) -> bool:
    import httpx
    url = f"https://graph.facebook.com/v21.0/{empresa.phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {empresa.whatsapp_token}", "Content-Type": "application/json"}
    body = {
        "messaging_product": "whatsapp",
        "to": whatsapp_number,
        "type": "template",
        "template": {"name": template_nome, "language": {"code": idioma or "pt_BR"}, "components": componentes},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            logger.warning(f"Falha ao enviar template {template_nome} para {whatsapp_number}: {resp.text[:200]}")
        return resp.status_code == 200


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/agenda/lembrete-config")
async def get_lembrete_config(
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Retorna configuração de lembrete da empresa."""
    cfg = db.query(AgendaLembreteConfig).filter(AgendaLembreteConfig.empresa_id == empresa_id).first()
    if not cfg:
        return {"empresa_id": empresa_id, "ativo": False,
                "modelo_id": None, "modelo_params": [],
                "template_id": None, "template_params": {}}

    modelo = db.query(ModeloMensagem).filter(ModeloMensagem.id == cfg.modelo_id).first() if cfg.modelo_id else None
    tmpl = db.query(MessageTemplate).filter(MessageTemplate.id == cfg.template_id).first() if cfg.template_id else None

    return {
        "id": cfg.id,
        "empresa_id": cfg.empresa_id,
        "modelo_id": cfg.modelo_id,
        "modelo_nome": modelo.nome if modelo else None,
        "modelo_mensagem": modelo.mensagem if modelo else None,
        "modelo_params": cfg.modelo_params or [],
        "template_id": cfg.template_id,
        "template_name": tmpl.name if tmpl else None,
        "template_body": next(
            (c.get('text', '') for c in (tmpl.components or []) if c.get('type', '').upper() == 'BODY'), ''
        ) if tmpl else None,
        "template_params": cfg.template_params or {},
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
    cfg = db.query(AgendaLembreteConfig).filter(AgendaLembreteConfig.empresa_id == empresa_id).first()
    if not cfg:
        cfg = AgendaLembreteConfig(empresa_id=empresa_id)
        db.add(cfg)

    for campo in ['modelo_id', 'modelo_params', 'template_id', 'template_params', 'ativo']:
        if campo in dados:
            setattr(cfg, campo, dados[campo])

    cfg.atualizado_em = datetime.utcnow()
    db.commit()
    return {"sucesso": True}


@router.get("/agenda/lembrete-opcoes")
async def get_lembrete_opcoes(
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Retorna modelos salvos e templates aprovados disponíveis para uso no lembrete."""
    modelos = db.query(ModeloMensagem).filter(
        ModeloMensagem.empresa_id == empresa_id
    ).order_by(ModeloMensagem.criado_em.desc()).all()

    templates = db.query(MessageTemplate).filter(
        MessageTemplate.empresa_id == empresa_id,
        MessageTemplate.status == 'APPROVED',
    ).order_by(MessageTemplate.name).all()

    def _body_text(t: MessageTemplate) -> str:
        for c in (t.components or []):
            if c.get('type', '').upper() == 'BODY':
                return c.get('text', '')
        return ''

    def _count_params(text: str) -> list:
        return sorted(set(re.findall(r'\{\{(\d+)\}\}', text)), key=int)

    return {
        "modelos": [
            {
                "id": m.id,
                "nome": m.nome,
                "tipo": m.tipo,
                "mensagem": m.mensagem,
                "num_variaveis": (m.mensagem or '').count('{}'),
            }
            for m in modelos
        ],
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "language": t.language,
                "body_text": _body_text(t),
                "params": _count_params(_body_text(t)),
            }
            for t in templates
        ],
        "campos_disponiveis": [
            {"value": v, "label": l} for v, l in CAMPOS_DISPONÍVEIS
        ],
    }


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

    cfg = db.query(AgendaLembreteConfig).filter(AgendaLembreteConfig.empresa_id == empresa_id).first()
    if not cfg or (not cfg.modelo_id and not cfg.template_id):
        raise HTTPException(status_code=404, detail="Configure o lembrete primeiro em Agendamentos → Configurar Lembrete")

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa or not empresa.whatsapp_token:
        raise HTTPException(status_code=400, detail="WhatsApp não configurado para esta empresa")

    cliente = db.query(Cliente).filter(Cliente.id == ag.cliente_id).first() if ag.cliente_id else None
    janela_aberta = await _janela_24h_aberta(empresa_id, ag.whatsapp_number)
    enviado = False
    canal = 'nenhum'

    # Mensagem interativa (janela 24h aberta)
    if janela_aberta and cfg.modelo_id:
        modelo = db.query(ModeloMensagem).filter(ModeloMensagem.id == cfg.modelo_id).first()
        if modelo:
            texto = _resolver_modelo(modelo, cfg.modelo_params or [], ag, cliente)
            payload = _construir_payload_modelo(modelo, texto)
            enviado = await _enviar_payload(empresa, ag.whatsapp_number, payload)
            canal = 'interativo'

    # Template Meta (fora da janela ou fallback)
    if not enviado and cfg.template_id:
        tmpl = db.query(MessageTemplate).filter(MessageTemplate.id == cfg.template_id).first()
        if tmpl:
            componentes = _construir_componentes_template(
                tmpl.components or [], cfg.template_params or {}, ag, cliente
            )
            enviado = await _enviar_template_api(
                empresa, ag.whatsapp_number, tmpl.name, tmpl.language or 'pt_BR', componentes
            )
            canal = 'template'

    if enviado:
        ag.lembrete_enviado = True
        db.commit()

    return {"enviado": enviado, "canal": canal, "whatsapp_number": ag.whatsapp_number}
