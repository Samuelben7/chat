"""
Endpoints de assinaturas para empresas e devs.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database.database import get_db
from app.models.models import Assinatura, Plano
from app.schemas.planos import AssinaturaResponse, AssinaturaCriarRequest
from app.core.dependencies import CurrentUser

router = APIRouter(prefix="/assinatura", tags=["assinaturas"])


@router.get("/minha", response_model=AssinaturaResponse)
async def minha_assinatura(
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Retorna assinatura ativa do usuario (empresa ou dev)."""
    query = db.query(Assinatura)

    if user.role == "dev":
        dev_id = getattr(user, 'dev_id', None)
        if not dev_id:
            from app.core.auth import decodificar_token
            from app.core.dependencies import get_token_from_header
            raise HTTPException(status_code=400, detail="dev_id not found in token")
        query = query.filter(Assinatura.dev_id == dev_id)
    elif user.role in ("empresa", "admin"):
        query = query.filter(Assinatura.empresa_id == user.empresa_id)
    else:
        raise HTTPException(status_code=403, detail="Role nao suportada")

    assinatura = query.filter(
        Assinatura.status.in_(["active", "overdue"])
    ).order_by(Assinatura.data_inicio.desc()).first()

    if not assinatura:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura ativa")

    return AssinaturaResponse(
        id=assinatura.id,
        tipo_usuario=assinatura.tipo_usuario,
        plano_id=assinatura.plano_id,
        plano_nome=assinatura.plano.nome if assinatura.plano else None,
        status=assinatura.status,
        data_inicio=assinatura.data_inicio,
        data_proximo_vencimento=assinatura.data_proximo_vencimento,
    )


@router.post("/criar", response_model=AssinaturaResponse, status_code=201)
async def criar_assinatura(
    dados: AssinaturaCriarRequest,
    user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Cria assinatura (chamado pelo fluxo de pagamento)."""
    plano = db.query(Plano).filter(Plano.id == dados.plano_id, Plano.ativo == True).first()
    if not plano:
        raise HTTPException(status_code=404, detail="Plano nao encontrado")

    # Determinar tipo
    if user.role == "dev":
        tipo = "dev"
        dev_id = user.dev_id
    else:
        tipo = "empresa"
        dev_id = None

    if plano.tipo != tipo:
        raise HTTPException(status_code=400, detail=f"Plano e do tipo '{plano.tipo}', esperado '{tipo}'")

    assinatura = Assinatura(
        tipo_usuario=tipo,
        empresa_id=user.empresa_id if tipo == "empresa" else None,
        dev_id=dev_id if tipo == "dev" else None,
        plano_id=plano.id,
        status="active",
        data_proximo_vencimento=datetime.utcnow() + timedelta(days=30),
    )
    db.add(assinatura)
    db.commit()
    db.refresh(assinatura)

    return AssinaturaResponse(
        id=assinatura.id,
        tipo_usuario=assinatura.tipo_usuario,
        plano_id=assinatura.plano_id,
        plano_nome=plano.nome,
        status=assinatura.status,
        data_inicio=assinatura.data_inicio,
        data_proximo_vencimento=assinatura.data_proximo_vencimento,
    )
