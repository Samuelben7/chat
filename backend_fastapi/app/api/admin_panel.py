"""
Admin Panel - Endpoints de gerenciamento de devs, financeiro e gateway.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional, List

from app.database.database import get_db
from app.models.models import (
    DevUsuario, Assinatura, Pagamento, Plano, GatewayLog,
    Empresa, ApiKey, DevNumero
)
from app.core.dependencies import CurrentUser
from app.services.mercadopago_platform import MercadoPagoPlatformService
from pydantic import BaseModel
from decimal import Decimal
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger("admin_panel")

router = APIRouter(prefix="/admin", tags=["admin-panel"])


def _require_admin(user: CurrentUser):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")


# ==================== DEVS ====================

@router.get("/devs")
async def listar_devs(
    user: CurrentUser = None,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
):
    """Lista devs com status, uso e plano."""
    _require_admin(user)

    query = db.query(DevUsuario)
    if status:
        query = query.filter(DevUsuario.status == status)

    total = query.count()
    devs = query.order_by(DevUsuario.criado_em.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    result = []
    for dev in devs:
        # Assinatura ativa
        assinatura = db.query(Assinatura).filter(
            Assinatura.dev_id == dev.id,
            Assinatura.status.in_(["active", "overdue"])
        ).first()

        # Total de keys ativas
        keys_count = db.query(func.count(ApiKey.id)).filter(
            ApiKey.dev_id == dev.id,
            ApiKey.ativa == True
        ).scalar()

        # Total de numeros ativos
        numeros_count = db.query(func.count(DevNumero.id)).filter(
            DevNumero.dev_id == dev.id,
            DevNumero.ativo == True,
        ).scalar()

        result.append({
            "id": dev.id,
            "nome": dev.nome,
            "email": dev.email,
            "empresa_nome": dev.empresa_nome,
            "status": dev.status,
            "whatsapp_conectado": bool(dev.phone_number_id) or numeros_count > 0,
            "numeros_count": numeros_count,
            "trial_fim": dev.trial_fim.isoformat() if dev.trial_fim else None,
            "criado_em": dev.criado_em.isoformat() if dev.criado_em else None,
            "plano": assinatura.plano.nome if assinatura and assinatura.plano else "Sem plano",
            "keys_ativas": keys_count,
        })

    return {"devs": result, "total": total, "page": page, "per_page": per_page}


@router.get("/devs/{dev_id}")
async def detalhe_dev(
    dev_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Detalhe completo de um dev."""
    _require_admin(user)

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    keys = db.query(ApiKey).filter(ApiKey.dev_id == dev_id).order_by(ApiKey.criada_em.desc()).all()
    assinaturas = db.query(Assinatura).filter(Assinatura.dev_id == dev_id).order_by(Assinatura.data_inicio.desc()).all()
    pagamentos = db.query(Pagamento).filter(Pagamento.dev_id == dev_id).order_by(Pagamento.criado_em.desc()).limit(20).all()
    numeros = db.query(DevNumero).filter(DevNumero.dev_id == dev_id).order_by(DevNumero.criado_em.desc()).all()

    # Uso do mes
    from app.services.usage_tracker import usage_tracker
    usage = usage_tracker.get_usage_summary(dev_id, db)

    return {
        "dev": {
            "id": dev.id,
            "nome": dev.nome,
            "email": dev.email,
            "telefone": dev.telefone,
            "empresa_nome": dev.empresa_nome,
            "status": dev.status,
            "phone_number_id": dev.phone_number_id,
            "waba_id": dev.waba_id,
            "webhook_url": dev.webhook_url,
            "trial_inicio": dev.trial_inicio,
            "trial_fim": dev.trial_fim,
            "criado_em": dev.criado_em,
        },
        "api_keys": [
            {
                "id": k.id,
                "key_prefix": k.key_prefix,
                "nome": k.nome,
                "ativa": k.ativa,
                "ultima_utilizacao": k.ultima_utilizacao,
                "criada_em": k.criada_em,
            }
            for k in keys
        ],
        "assinaturas": [
            {
                "id": a.id,
                "plano_nome": a.plano.nome if a.plano else None,
                "status": a.status,
                "data_inicio": a.data_inicio,
                "data_proximo_vencimento": a.data_proximo_vencimento,
            }
            for a in assinaturas
        ],
        "pagamentos": [
            {
                "id": p.id,
                "valor": float(p.valor),
                "metodo": p.metodo,
                "status": p.status,
                "mp_payment_id": p.mp_payment_id,
                "criado_em": p.criado_em,
            }
            for p in pagamentos
        ],
        "usage": usage,
        "numeros": [
            {
                "id": n.id,
                "phone_number_id": n.phone_number_id,
                "display_phone_number": n.display_phone_number,
                "verified_name": n.verified_name,
                "waba_id": n.waba_id,
                "status": n.status,
                "mp_subscription_status": n.mp_subscription_status,
                "mp_preapproval_id": n.mp_preapproval_id,
                "primeiro_uso_em": n.primeiro_uso_em,
                "ativo": n.ativo,
                "criado_em": n.criado_em,
            }
            for n in numeros
        ],
    }


@router.post("/devs/{dev_id}/block")
async def bloquear_dev(
    dev_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Bloqueia um dev."""
    _require_admin(user)

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    dev.status = "blocked"
    db.commit()
    return {"message": f"Dev {dev.nome} bloqueado"}


@router.post("/devs/{dev_id}/unblock")
async def desbloquear_dev(
    dev_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Desbloqueia um dev."""
    _require_admin(user)

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    dev.status = "active"
    db.commit()
    return {"message": f"Dev {dev.nome} desbloqueado"}


# ==================== PLANOS PERSONALIZADOS ====================

class PlanoPersonalizadoRequest(BaseModel):
    nome: str
    preco_mensal: Decimal
    limites: Dict[str, Any]  # {conversas_mes, ia_conversas, max_atendentes}
    dias_gratuitos: int = 0

class DiasGratuitosRequest(BaseModel):
    dias: int


@router.get("/empresas")
async def listar_empresas_admin(
    user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    """Lista todas as empresas com status de assinatura."""
    _require_admin(user)
    empresas = db.query(Empresa).order_by(Empresa.id.desc()).all()
    result = []
    for emp in empresas:
        assinatura = db.query(Assinatura).filter(
            Assinatura.empresa_id == emp.id,
            Assinatura.status.in_(["active", "overdue"])
        ).order_by(Assinatura.data_inicio.desc()).first()

        if assinatura and assinatura.is_personalizado:
            plano_info = assinatura.plano_personalizado_nome or "Personalizado"
            preco = float(assinatura.preco_personalizado or 0)
        elif assinatura and assinatura.plano:
            plano_info = assinatura.plano.nome
            preco = float(assinatura.plano.preco_mensal)
        else:
            plano_info = "Sem plano"
            preco = 0

        result.append({
            "id": emp.id,
            "nome": emp.nome,
            "email": emp.admin_email,
            "ativa": emp.ativa,
            "whatsapp_conectado": bool(emp.whatsapp_token and emp.phone_number_id),
            "plano": plano_info,
            "preco": preco,
            "is_personalizado": assinatura.is_personalizado if assinatura else False,
            "status_assinatura": assinatura.status if assinatura else "sem_assinatura",
            "vencimento": assinatura.data_proximo_vencimento.isoformat() if assinatura and assinatura.data_proximo_vencimento else None,
            "trial_expira_em": assinatura.trial_expira_em.isoformat() if assinatura and assinatura.trial_expira_em else None,
            "limites": assinatura.limites_personalizados if (assinatura and assinatura.is_personalizado) else (assinatura.plano.limites if assinatura and assinatura.plano else {}),
            "assinatura_id": assinatura.id if assinatura else None,
        })
    return result


@router.post("/empresas/{empresa_id}/plano-personalizado")
async def definir_plano_personalizado(
    empresa_id: int,
    dados: PlanoPersonalizadoRequest,
    user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    """
    Cria ou atualiza plano personalizado para uma empresa.
    Admin define: nome, preço, limites (conversas_mes, ia_conversas, max_atendentes) e dias gratuitos.
    """
    _require_admin(user)

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    # Buscar plano base "empresa" para usar como referência
    plano_base = db.query(Plano).filter(Plano.tipo == "empresa", Plano.ativo == True).order_by(Plano.ordem).first()
    if not plano_base:
        raise HTTPException(status_code=400, detail="Nenhum plano empresa base cadastrado")

    # Verificar se já tem assinatura ativa
    assinatura = db.query(Assinatura).filter(
        Assinatura.empresa_id == empresa_id,
        Assinatura.status.in_(["active", "overdue"])
    ).order_by(Assinatura.data_inicio.desc()).first()

    agora = datetime.utcnow()
    trial_expira = agora + timedelta(days=dados.dias_gratuitos) if dados.dias_gratuitos > 0 else None
    vencimento = (trial_expira or agora) + timedelta(days=30)

    if assinatura:
        # Atualizar existente
        assinatura.is_personalizado = True
        assinatura.plano_personalizado_nome = dados.nome
        assinatura.preco_personalizado = dados.preco_mensal
        assinatura.limites_personalizados = dados.limites
        assinatura.dias_gratuitos = dados.dias_gratuitos
        if dados.dias_gratuitos > 0:
            assinatura.trial_expira_em = trial_expira
        assinatura.data_proximo_vencimento = vencimento
        assinatura.status = "active"
    else:
        # Criar nova assinatura personalizada
        assinatura = Assinatura(
            tipo_usuario="empresa",
            empresa_id=empresa_id,
            plano_id=plano_base.id,
            status="active",
            is_personalizado=True,
            plano_personalizado_nome=dados.nome,
            preco_personalizado=dados.preco_mensal,
            limites_personalizados=dados.limites,
            dias_gratuitos=dados.dias_gratuitos,
            trial_expira_em=trial_expira,
            data_proximo_vencimento=vencimento,
        )
        db.add(assinatura)

    db.commit()
    logger.info(f"Admin: plano personalizado '{dados.nome}' definido para empresa {empresa_id}")
    return {
        "sucesso": True,
        "empresa": empresa.nome,
        "plano": dados.nome,
        "preco": float(dados.preco_mensal),
        "dias_gratuitos": dados.dias_gratuitos,
        "vencimento": vencimento.isoformat(),
    }


@router.post("/empresas/{empresa_id}/dias-gratuitos")
async def conceder_dias_gratuitos(
    empresa_id: int,
    dados: DiasGratuitosRequest,
    user: CurrentUser = None,
    db: Session = Depends(get_db),
):
    """Concede N dias gratuitos adicionais para a empresa, estendendo o vencimento."""
    _require_admin(user)

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    assinatura = db.query(Assinatura).filter(
        Assinatura.empresa_id == empresa_id,
        Assinatura.status.in_(["active", "overdue", "blocked"])
    ).order_by(Assinatura.data_inicio.desc()).first()

    agora = datetime.utcnow()
    if assinatura:
        base = assinatura.data_proximo_vencimento or agora
        if base < agora:
            base = agora
        assinatura.data_proximo_vencimento = base + timedelta(days=dados.dias)
        assinatura.dias_gratuitos = (assinatura.dias_gratuitos or 0) + dados.dias
        assinatura.status = "active"
    else:
        # Criar assinatura trial sem plano personalizado
        plano_base = db.query(Plano).filter(Plano.tipo == "empresa", Plano.ativo == True).order_by(Plano.ordem).first()
        if not plano_base:
            raise HTTPException(status_code=400, detail="Nenhum plano empresa base cadastrado")
        assinatura = Assinatura(
            tipo_usuario="empresa",
            empresa_id=empresa_id,
            plano_id=plano_base.id,
            status="active",
            dias_gratuitos=dados.dias,
            trial_expira_em=agora + timedelta(days=dados.dias),
            data_proximo_vencimento=agora + timedelta(days=dados.dias),
        )
        db.add(assinatura)

    db.commit()
    logger.info(f"Admin: {dados.dias} dias gratuitos concedidos para empresa {empresa_id}")
    return {
        "sucesso": True,
        "empresa": empresa.nome,
        "dias_adicionados": dados.dias,
        "novo_vencimento": assinatura.data_proximo_vencimento.isoformat(),
    }


# ==================== FINANCEIRO ====================

@router.get("/empresas/financeiro")
async def empresas_financeiro(
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Lista empresas com status financeiro."""
    _require_admin(user)

    empresas = db.query(Empresa).filter(Empresa.ativa == True).all()
    result = []

    for emp in empresas:
        assinatura = db.query(Assinatura).filter(
            Assinatura.empresa_id == emp.id,
            Assinatura.status.in_(["active", "overdue"])
        ).first()

        result.append({
            "id": emp.id,
            "nome": emp.nome,
            "email": emp.admin_email,
            "plano": assinatura.plano.nome if assinatura and assinatura.plano else "Sem plano",
            "status_assinatura": assinatura.status if assinatura else "sem_assinatura",
            "proximo_vencimento": assinatura.data_proximo_vencimento if assinatura else None,
        })

    return {"empresas": result}


@router.get("/pagamentos")
async def listar_pagamentos(
    user: CurrentUser = None,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    tipo: Optional[str] = None,
    metodo: Optional[str] = None,
):
    """Lista todos pagamentos com filtros."""
    _require_admin(user)

    query = db.query(Pagamento)
    if status:
        query = query.filter(Pagamento.status == status)
    if tipo:
        query = query.filter(Pagamento.tipo_usuario == tipo)
    if metodo:
        query = query.filter(Pagamento.metodo == metodo)

    total = query.count()
    pagamentos = query.order_by(Pagamento.criado_em.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    return {
        "pagamentos": [
            {
                "id": p.id,
                "tipo_usuario": p.tipo_usuario,
                "empresa_id": p.empresa_id,
                "dev_id": p.dev_id,
                "valor": float(p.valor),
                "metodo": p.metodo,
                "status": p.status,
                "mp_payment_id": p.mp_payment_id,
                "criado_em": p.criado_em,
            }
            for p in pagamentos
        ],
        "total": total,
        "page": page,
    }


@router.get("/pagamentos/totais")
async def totais_pagamentos(
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Receita total (hoje, mes, por plano)."""
    _require_admin(user)

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Receita hoje
    receita_hoje = db.query(func.sum(Pagamento.valor)).filter(
        Pagamento.status == "approved",
        Pagamento.criado_em >= today_start,
    ).scalar() or 0

    # Receita mes
    receita_mes = db.query(func.sum(Pagamento.valor)).filter(
        Pagamento.status == "approved",
        Pagamento.criado_em >= month_start,
    ).scalar() or 0

    # Receita total
    receita_total = db.query(func.sum(Pagamento.valor)).filter(
        Pagamento.status == "approved",
    ).scalar() or 0

    # Por plano
    por_plano = db.query(
        Plano.nome,
        func.count(Pagamento.id).label("total_pagamentos"),
        func.sum(Pagamento.valor).label("total_valor"),
    ).join(
        Assinatura, Assinatura.id == Pagamento.assinatura_id
    ).join(
        Plano, Plano.id == Assinatura.plano_id
    ).filter(
        Pagamento.status == "approved"
    ).group_by(Plano.nome).all()

    return {
        "receita_hoje": float(receita_hoje),
        "receita_mes": float(receita_mes),
        "receita_total": float(receita_total),
        "por_plano": [
            {
                "plano": row.nome,
                "pagamentos": row.total_pagamentos,
                "valor_total": float(row.total_valor or 0),
            }
            for row in por_plano
        ],
    }


@router.post("/pagamentos/{pagamento_id}/reembolso")
async def reembolsar_pagamento(
    pagamento_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Reembolsa pagamento via MP API."""
    _require_admin(user)

    pagamento = db.query(Pagamento).filter(Pagamento.id == pagamento_id).first()
    if not pagamento:
        raise HTTPException(status_code=404, detail="Pagamento nao encontrado")

    if pagamento.status != "approved":
        raise HTTPException(status_code=400, detail="So pagamentos aprovados podem ser reembolsados")

    if not pagamento.mp_payment_id:
        raise HTTPException(status_code=400, detail="Pagamento sem ID do Mercado Pago")

    try:
        mp = MercadoPagoPlatformService()
        result = await mp.refund_payment(pagamento.mp_payment_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not result:
        raise HTTPException(status_code=500, detail="Erro ao processar reembolso")

    pagamento.status = "refunded"
    pagamento.dados_extras = {**(pagamento.dados_extras or {}), "refund": result}
    db.commit()

    return {"message": "Reembolso processado", "refund": result}


# ==================== GATEWAY MONITOR ====================

@router.get("/gateway/monitor")
async def gateway_stats(
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Stats agregados do gateway."""
    _require_admin(user)

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Requests hoje
    requests_hoje = db.query(func.count(GatewayLog.id)).filter(
        GatewayLog.timestamp >= today_start
    ).scalar() or 0

    # Latencia media hoje
    avg_latency = db.query(func.avg(GatewayLog.latency_ms)).filter(
        GatewayLog.timestamp >= today_start
    ).scalar() or 0

    # Top devs (por requests hoje)
    top_devs = db.query(
        GatewayLog.dev_id,
        DevUsuario.nome,
        func.count(GatewayLog.id).label("requests")
    ).join(
        DevUsuario, DevUsuario.id == GatewayLog.dev_id
    ).filter(
        GatewayLog.timestamp >= today_start
    ).group_by(
        GatewayLog.dev_id, DevUsuario.nome
    ).order_by(
        func.count(GatewayLog.id).desc()
    ).limit(10).all()

    # Erros (status != 200) hoje
    erros_hoje = db.query(func.count(GatewayLog.id)).filter(
        GatewayLog.timestamp >= today_start,
        GatewayLog.status_code != 200,
    ).scalar() or 0

    return {
        "requests_hoje": requests_hoje,
        "avg_latency_ms": round(float(avg_latency), 1),
        "erros_hoje": erros_hoje,
        "top_devs": [
            {"dev_id": r.dev_id, "nome": r.nome, "requests": r.requests}
            for r in top_devs
        ],
    }


@router.get("/gateway/monitor/{dev_id}")
async def gateway_stats_dev(
    dev_id: int,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Stats do gateway por dev."""
    _require_admin(user)

    from app.services.usage_tracker import usage_tracker
    summary = usage_tracker.get_usage_summary(dev_id, db)
    history = usage_tracker.get_usage_history(dev_id, db)

    return {
        "summary": summary,
        "history": history,
    }
