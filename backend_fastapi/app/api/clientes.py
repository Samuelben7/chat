"""
Gerenciamento de clientes com campos customizáveis.
"""
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import Optional, List
from datetime import datetime

from app.database.database import get_db
from app.models.models import Cliente, CampoCustomCliente, ClienteValorCustom
from app.core.dependencies import CurrentUser, EmpresaIdFromToken

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_slug(nome: str) -> str:
    return re.sub(r'[^a-z0-9_]', '_', nome.lower().strip())


def _cliente_resumo(c: Cliente) -> dict:
    """Serializa cliente como item de lista."""
    return {
        "id": c.id,
        "nome_completo": c.nome_completo,
        "whatsapp_number": c.whatsapp_number,
        "email": c.email,
        "cidade": c.cidade,
        "estado": c.estado,
        "funil_etapa": c.funil_etapa or "novo_lead",
        "atualizado_em_crm": c.atualizado_em_crm.isoformat() if c.atualizado_em_crm else None,
        "criado_em_crm": c.criado_em_crm.isoformat() if c.criado_em_crm else None,
        "foto_url": c.foto_url,
    }


def _cliente_detalhe(c: Cliente, campos_custom: list, valores_map: dict) -> dict:
    """Serializa cliente com todos os campos incluindo custom."""
    base = {
        "id": c.id,
        # Dados básicos
        "nome_completo": c.nome_completo,
        "whatsapp_number": c.whatsapp_number,
        "email": c.email,
        "cpf": c.cpf,
        "data_nascimento": str(c.data_nascimento) if c.data_nascimento else None,
        "telefone_secundario": c.telefone_secundario,
        "cidade": c.cidade,
        "estado": c.estado,
        "bairro": c.bairro,
        "endereco_residencial": c.endereco_residencial,
        "cep": c.cep,
        "complemento": c.complemento,
        "pais": c.pais,
        "foto_url": c.foto_url,
        # Profissional
        "profissao": c.profissao,
        "empresa_cliente": c.empresa_cliente,
        "chave_pix": c.chave_pix,
        # CRM
        "funil_etapa": c.funil_etapa or "novo_lead",
        "valor_estimado": float(c.valor_estimado) if c.valor_estimado else None,
        "observacoes_crm": c.observacoes_crm,
        "resumo_conversa": c.resumo_conversa,
        "preferencias": c.preferencias,
        "crm_arquivado": c.crm_arquivado or False,
        "responsavel_id": c.responsavel_id,
        "responsavel_nome": c.responsavel.nome_exibicao if c.responsavel else None,
        "criado_em_crm": c.criado_em_crm.isoformat() if c.criado_em_crm else None,
        "atualizado_em_crm": c.atualizado_em_crm.isoformat() if c.atualizado_em_crm else None,
        # Campos customizados
        "campos_custom": [
            {
                "campo_id": campo.id,
                "slug": campo.slug,
                "nome": campo.nome,
                "tipo": campo.tipo,
                "opcoes": campo.opcoes,
                "obrigatorio": campo.obrigatorio,
                "ordem": campo.ordem,
                "valor": valores_map.get(campo.id),
            }
            for campo in campos_custom
        ],
    }
    return base


# ─── Clientes ──────────────────────────────────────────────────────────────────

@router.get("/clientes/")
async def listar_clientes(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    busca: Optional[str] = Query(None, description="Busca por nome ou número"),
    funil_etapa: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Lista clientes da empresa com busca e paginação."""
    query = db.query(Cliente).filter(Cliente.empresa_id == empresa_id)

    if busca:
        termo = f"%{busca}%"
        query = query.filter(
            or_(
                Cliente.nome_completo.ilike(termo),
                Cliente.whatsapp_number.ilike(termo),
                Cliente.email.ilike(termo),
            )
        )

    if funil_etapa:
        query = query.filter(Cliente.funil_etapa == funil_etapa)

    total = query.count()
    clientes = query.order_by(Cliente.atualizado_em_crm.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_cliente_resumo(c) for c in clientes],
    }


@router.get("/clientes/{cliente_id}")
async def detalhe_cliente(
    cliente_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Retorna detalhe completo do cliente incluindo campos custom."""
    cliente = db.query(Cliente).options(
        joinedload(Cliente.responsavel),
        joinedload(Cliente.campos_custom_valores).joinedload(ClienteValorCustom.campo),
    ).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id,
    ).first()

    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Campos custom definidos pela empresa (ativos, ordenados)
    campos_custom = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.empresa_id == empresa_id,
        CampoCustomCliente.ativo == True,
    ).order_by(CampoCustomCliente.ordem, CampoCustomCliente.id).all()

    # Mapa campo_id -> valor atual do cliente
    valores_map = {v.campo_id: v.valor for v in cliente.campos_custom_valores}

    return _cliente_detalhe(cliente, campos_custom, valores_map)


@router.put("/clientes/{cliente_id}")
async def atualizar_cliente(
    cliente_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Atualiza campos padrão do cliente."""
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id,
    ).first()

    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    CAMPOS_PERMITIDOS = {
        "nome_completo", "email", "cpf", "data_nascimento", "telefone_secundario",
        "cidade", "estado", "bairro", "endereco_residencial", "cep", "complemento", "pais",
        "profissao", "empresa_cliente", "chave_pix",
        "funil_etapa", "valor_estimado", "observacoes_crm", "resumo_conversa", "preferencias",
    }

    for campo, valor in dados.items():
        if campo in CAMPOS_PERMITIDOS:
            setattr(cliente, campo, valor)

    cliente.atualizado_em_crm = datetime.utcnow()
    db.commit()
    db.refresh(cliente)

    return {"ok": True, "id": cliente.id}


# ─── Campos Custom ─────────────────────────────────────────────────────────────

@router.get("/clientes/campos-custom/")
async def listar_campos_custom(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    incluir_inativos: bool = False,
):
    """Lista campos customizados definidos pela empresa."""
    query = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.empresa_id == empresa_id,
    )
    if not incluir_inativos:
        query = query.filter(CampoCustomCliente.ativo == True)

    campos = query.order_by(CampoCustomCliente.ordem, CampoCustomCliente.id).all()

    return [
        {
            "id": c.id,
            "nome": c.nome,
            "slug": c.slug,
            "tipo": c.tipo,
            "opcoes": c.opcoes,
            "obrigatorio": c.obrigatorio,
            "ativo": c.ativo,
            "ordem": c.ordem,
            "criado_em": c.criado_em.isoformat() if c.criado_em else None,
        }
        for c in campos
    ]


@router.post("/clientes/campos-custom/", status_code=201)
async def criar_campo_custom(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Cria novo campo customizado para clientes da empresa."""
    nome = dados.get("nome", "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome do campo é obrigatório")

    tipo = dados.get("tipo", "texto")
    TIPOS_VALIDOS = {"texto", "numero", "data", "opcoes", "booleano"}
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use: {', '.join(TIPOS_VALIDOS)}")

    slug = _make_slug(nome)

    # Verificar duplicidade de slug na empresa
    existente = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.empresa_id == empresa_id,
        CampoCustomCliente.slug == slug,
    ).first()
    if existente:
        slug = f"{slug}_{existente.id}"

    campo = CampoCustomCliente(
        empresa_id=empresa_id,
        nome=nome,
        slug=slug,
        tipo=tipo,
        opcoes=dados.get("opcoes"),
        obrigatorio=dados.get("obrigatorio", False),
        ativo=True,
        ordem=dados.get("ordem", 0),
    )
    db.add(campo)
    db.commit()
    db.refresh(campo)

    return {
        "id": campo.id,
        "nome": campo.nome,
        "slug": campo.slug,
        "tipo": campo.tipo,
        "opcoes": campo.opcoes,
        "obrigatorio": campo.obrigatorio,
        "ativo": campo.ativo,
        "ordem": campo.ordem,
    }


@router.put("/clientes/campos-custom/{campo_id}")
async def editar_campo_custom(
    campo_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Edita campo customizado da empresa."""
    campo = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.id == campo_id,
        CampoCustomCliente.empresa_id == empresa_id,
    ).first()

    if not campo:
        raise HTTPException(status_code=404, detail="Campo não encontrado")

    if "nome" in dados and dados["nome"].strip():
        campo.nome = dados["nome"].strip()
        campo.slug = _make_slug(campo.nome)

    if "tipo" in dados:
        TIPOS_VALIDOS = {"texto", "numero", "data", "opcoes", "booleano"}
        if dados["tipo"] not in TIPOS_VALIDOS:
            raise HTTPException(status_code=400, detail="Tipo inválido")
        campo.tipo = dados["tipo"]

    if "opcoes" in dados:
        campo.opcoes = dados["opcoes"]
    if "obrigatorio" in dados:
        campo.obrigatorio = dados["obrigatorio"]
    if "ativo" in dados:
        campo.ativo = dados["ativo"]
    if "ordem" in dados:
        campo.ordem = dados["ordem"]

    db.commit()
    db.refresh(campo)

    return {
        "id": campo.id,
        "nome": campo.nome,
        "slug": campo.slug,
        "tipo": campo.tipo,
        "opcoes": campo.opcoes,
        "obrigatorio": campo.obrigatorio,
        "ativo": campo.ativo,
        "ordem": campo.ordem,
    }


@router.delete("/clientes/campos-custom/{campo_id}")
async def deletar_campo_custom(
    campo_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Remove campo customizado (e todos os valores associados via CASCADE)."""
    campo = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.id == campo_id,
        CampoCustomCliente.empresa_id == empresa_id,
    ).first()

    if not campo:
        raise HTTPException(status_code=404, detail="Campo não encontrado")

    db.delete(campo)
    db.commit()

    return {"ok": True}


# ─── Valores Custom por Cliente ────────────────────────────────────────────────

@router.put("/clientes/{cliente_id}/valores-custom/{campo_id}")
async def setar_valor_custom(
    cliente_id: int,
    campo_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Define ou atualiza o valor de um campo custom para um cliente específico."""
    # Validar que o cliente pertence à empresa
    cliente = db.query(Cliente).filter(
        Cliente.id == cliente_id,
        Cliente.empresa_id == empresa_id,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Validar que o campo pertence à empresa
    campo = db.query(CampoCustomCliente).filter(
        CampoCustomCliente.id == campo_id,
        CampoCustomCliente.empresa_id == empresa_id,
    ).first()
    if not campo:
        raise HTTPException(status_code=404, detail="Campo não encontrado")

    valor_str = dados.get("valor")

    # Upsert
    registro = db.query(ClienteValorCustom).filter(
        ClienteValorCustom.cliente_id == cliente_id,
        ClienteValorCustom.campo_id == campo_id,
    ).first()

    if registro:
        registro.valor = valor_str
        registro.atualizado_em = datetime.utcnow()
    else:
        registro = ClienteValorCustom(
            cliente_id=cliente_id,
            campo_id=campo_id,
            valor=valor_str,
        )
        db.add(registro)

    db.commit()

    return {"ok": True, "campo_id": campo_id, "valor": valor_str}
