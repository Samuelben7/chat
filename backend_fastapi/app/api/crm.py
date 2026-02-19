"""
P4 - CRM Completo: Tags, Funil de Vendas (Kanban) e dados CRM dos clientes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from app.database.database import get_db
from app.models.models import Cliente, Atendente, CrmTag, CrmClienteTag
from app.core.dependencies import CurrentUser, EmpresaIdFromToken

router = APIRouter()

# ─── Etapas do Funil ──────────────────────────────────────────────────────────

ETAPAS_FUNIL = [
    {"id": "novo_lead",          "label": "Novo Lead",          "cor": "#6366f1"},
    {"id": "pediu_orcamento",    "label": "Pediu Orçamento",    "cor": "#f59e0b"},
    {"id": "orcamento_enviado",  "label": "Orçamento Enviado",  "cor": "#3b82f6"},
    {"id": "negociacao",         "label": "Negociação",         "cor": "#8b5cf6"},
    {"id": "fechado",            "label": "Fechado",            "cor": "#22c55e"},
    {"id": "perdido",            "label": "Perdido",            "cor": "#ef4444"},
]


def _cliente_to_card(c: Cliente) -> dict:
    """Serializa cliente como card do kanban."""
    return {
        "id": c.id,
        "nome": c.nome_completo,
        "whatsapp_number": c.whatsapp_number,
        "email": c.email,
        "funil_etapa": c.funil_etapa or "novo_lead",
        "valor_estimado": float(c.valor_estimado) if c.valor_estimado else None,
        "responsavel_id": c.responsavel_id,
        "responsavel_nome": c.responsavel.nome if c.responsavel else None,
        "resumo_conversa": c.resumo_conversa,
        "preferencias": c.preferencias,
        "observacoes_crm": c.observacoes_crm,
        "foto_url": c.foto_url,
        "data_nascimento": str(c.data_nascimento) if c.data_nascimento else None,
        "criado_em_crm": c.criado_em_crm.isoformat() if c.criado_em_crm else None,
        "atualizado_em_crm": c.atualizado_em_crm.isoformat() if c.atualizado_em_crm else None,
        "tags": [
            {
                "id": ct.tag.id,
                "nome": ct.tag.nome,
                "cor": ct.tag.cor,
                "emoji": ct.tag.emoji,
            }
            for ct in c.crm_tags
        ],
    }


# ─── Kanban / Funil ────────────────────────────────────────────────────────────

@router.get("/crm/funil")
async def listar_funil(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    responsavel_id: Optional[int] = None,
    tag_id: Optional[int] = None,
):
    """
    Retorna todos os leads agrupados por etapa do funil.
    Suporta filtros por responsável e por tag.
    """
    query = db.query(Cliente).filter(Cliente.empresa_id == empresa_id)

    if responsavel_id:
        query = query.filter(Cliente.responsavel_id == responsavel_id)

    if tag_id:
        query = query.join(CrmClienteTag, CrmClienteTag.cliente_id == Cliente.id)\
                     .filter(CrmClienteTag.tag_id == tag_id)

    clientes = query.all()

    # Agrupar por etapa
    grupos: dict = {e["id"]: [] for e in ETAPAS_FUNIL}
    for c in clientes:
        etapa = c.funil_etapa or "novo_lead"
        if etapa not in grupos:
            grupos[etapa] = []
        grupos[etapa].append(_cliente_to_card(c))

    return {
        "etapas": ETAPAS_FUNIL,
        "colunas": grupos,
        "total": len(clientes),
    }


@router.get("/crm/etapas")
async def listar_etapas(user: CurrentUser):
    """Retorna as etapas fixas do funil."""
    return ETAPAS_FUNIL


@router.patch("/crm/clientes/{cliente_id}/etapa")
async def mover_etapa(
    cliente_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Move um lead para outra etapa do funil (drag-and-drop)."""
    nova_etapa = dados.get("funil_etapa")
    etapas_validas = [e["id"] for e in ETAPAS_FUNIL]
    if nova_etapa not in etapas_validas:
        raise HTTPException(status_code=400, detail=f"Etapa inválida. Use: {etapas_validas}")

    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    cliente.funil_etapa = nova_etapa
    cliente.atualizado_em_crm = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Etapa atualizada", "funil_etapa": nova_etapa}


@router.put("/crm/clientes/{cliente_id}")
async def atualizar_crm(
    cliente_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Atualiza campos CRM de um cliente/lead."""
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    campos_crm = [
        'funil_etapa', 'valor_estimado', 'responsavel_id',
        'resumo_conversa', 'preferencias', 'observacoes_crm',
        'nome_completo', 'email', 'data_nascimento',
    ]
    for campo in campos_crm:
        if campo in dados:
            setattr(cliente, campo, dados[campo])

    # Validar etapa se fornecida
    if 'funil_etapa' in dados:
        etapas_validas = [e["id"] for e in ETAPAS_FUNIL]
        if dados['funil_etapa'] not in etapas_validas:
            raise HTTPException(status_code=400, detail="Etapa inválida")

    # Validar responsável se fornecido
    if 'responsavel_id' in dados and dados['responsavel_id']:
        atendente = db.query(Atendente).filter(
            Atendente.id == dados['responsavel_id'],
            Atendente.empresa_id == empresa_id
        ).first()
        if not atendente:
            raise HTTPException(status_code=404, detail="Atendente não encontrado")

    cliente.atualizado_em_crm = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cliente)
    return _cliente_to_card(cliente)


@router.get("/crm/clientes/{cliente_id}")
async def detalhe_crm(
    cliente_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Retorna dados CRM completos de um cliente."""
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return _cliente_to_card(cliente)


# ─── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/crm/tags")
async def listar_tags(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Lista todas as tags da empresa."""
    tags = db.query(CrmTag).filter(CrmTag.empresa_id == empresa_id).order_by(CrmTag.nome).all()
    return [
        {
            "id": t.id,
            "nome": t.nome,
            "cor": t.cor,
            "emoji": t.emoji,
            "total_clientes": len(t.clientes),
        }
        for t in tags
    ]


@router.post("/crm/tags", status_code=201)
async def criar_tag(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Cria uma nova tag."""
    if user.get("role") != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode criar tags")

    nome = dados.get("nome", "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome da tag é obrigatório")

    tag = CrmTag(
        empresa_id=empresa_id,
        nome=nome,
        cor=dados.get("cor", "#3B82F6"),
        emoji=dados.get("emoji"),
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return {"id": tag.id, "nome": tag.nome, "cor": tag.cor, "emoji": tag.emoji}


@router.put("/crm/tags/{tag_id}")
async def atualizar_tag(
    tag_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Atualiza uma tag."""
    if user.get("role") != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode editar tags")

    tag = db.query(CrmTag).filter(CrmTag.id == tag_id, CrmTag.empresa_id == empresa_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")

    for campo in ['nome', 'cor', 'emoji']:
        if campo in dados:
            setattr(tag, campo, dados[campo])
    db.commit()
    return {"id": tag.id, "nome": tag.nome, "cor": tag.cor, "emoji": tag.emoji}


@router.delete("/crm/tags/{tag_id}")
async def deletar_tag(
    tag_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Remove uma tag (e seus vínculos com clientes)."""
    if user.get("role") != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode deletar tags")

    tag = db.query(CrmTag).filter(CrmTag.id == tag_id, CrmTag.empresa_id == empresa_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")

    db.delete(tag)
    db.commit()
    return {"message": "Tag removida"}


@router.post("/crm/clientes/{cliente_id}/tags/{tag_id}")
async def adicionar_tag_cliente(
    cliente_id: int,
    tag_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Adiciona uma tag a um cliente."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id, Cliente.empresa_id == empresa_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    tag = db.query(CrmTag).filter(CrmTag.id == tag_id, CrmTag.empresa_id == empresa_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")

    existente = db.query(CrmClienteTag).filter(
        CrmClienteTag.cliente_id == cliente_id,
        CrmClienteTag.tag_id == tag_id
    ).first()
    if existente:
        return {"message": "Tag já adicionada"}

    vinculo = CrmClienteTag(empresa_id=empresa_id, cliente_id=cliente_id, tag_id=tag_id)
    db.add(vinculo)
    db.commit()
    return {"message": "Tag adicionada"}


@router.delete("/crm/clientes/{cliente_id}/tags/{tag_id}")
async def remover_tag_cliente(
    cliente_id: int,
    tag_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Remove uma tag de um cliente."""
    vinculo = db.query(CrmClienteTag).filter(
        CrmClienteTag.cliente_id == cliente_id,
        CrmClienteTag.tag_id == tag_id,
        CrmClienteTag.empresa_id == empresa_id,
    ).first()
    if not vinculo:
        raise HTTPException(status_code=404, detail="Vínculo não encontrado")

    db.delete(vinculo)
    db.commit()
    return {"message": "Tag removida do cliente"}


# ─── Atendentes disponíveis para responsável ──────────────────────────────────

@router.get("/crm/responsaveis")
async def listar_responsaveis(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Lista atendentes disponíveis para atribuir como responsável de leads."""
    atendentes = db.query(Atendente).filter(
        Atendente.empresa_id == empresa_id,
        Atendente.ativo == True
    ).all()
    return [{"id": a.id, "nome": a.nome, "foto_url": a.foto_url} for a in atendentes]
