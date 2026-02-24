"""
Endpoints de autenticacao para desenvolvedores (API Gateway).
"""
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets

from app.database.database import get_db
from app.models.models import DevUsuario, DevAuth
from app.schemas.dev import (
    DevRegistroRequest, DevLoginRequest, DevTokenResponse,
    DevConnectWhatsAppRequest, DevPerfilResponse
)
from app.core.auth import hash_senha, verificar_senha, criar_token_dev
from app.core.dependencies import CurrentDev
from app.core.config import settings

router = APIRouter(prefix="/auth/dev", tags=["dev-auth"])


@router.post("/register", response_model=DevTokenResponse, status_code=201)
async def registrar_dev(dados: DevRegistroRequest, db: Session = Depends(get_db)):
    """Registra novo desenvolvedor."""
    # Verificar email duplicado
    existing = db.query(DevAuth).filter(DevAuth.email == dados.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email ja cadastrado"
        )

    # Criar DevUsuario
    trial_dias = settings.DEV_TRIAL_DAYS
    dev = DevUsuario(
        nome=dados.nome,
        email=dados.email,
        telefone=dados.telefone,
        empresa_nome=dados.empresa_nome,
        status="trial",
        trial_inicio=datetime.utcnow(),
        trial_fim=datetime.utcnow() + timedelta(days=trial_dias),
        webhook_secret=secrets.token_hex(32),
    )
    db.add(dev)
    db.flush()

    # Criar DevAuth
    auth = DevAuth(
        dev_id=dev.id,
        email=dados.email,
        senha_hash=hash_senha(dados.senha),
    )
    db.add(auth)
    db.commit()
    db.refresh(dev)

    token = criar_token_dev(dev.id, dev.email)

    return DevTokenResponse(
        access_token=token,
        dev_id=dev.id,
        email=dev.email,
    )


@router.post("/login", response_model=DevTokenResponse)
async def login_dev(dados: DevLoginRequest, db: Session = Depends(get_db)):
    """Login de desenvolvedor."""
    auth = db.query(DevAuth).filter(DevAuth.email == dados.email).first()
    if not auth or not verificar_senha(dados.senha, auth.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    dev = db.query(DevUsuario).filter(DevUsuario.id == auth.dev_id).first()
    if not dev or not dev.ativo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta desativada"
        )

    # Atualizar ultimo login
    auth.ultimo_login = datetime.utcnow()
    db.commit()

    token = criar_token_dev(dev.id, dev.email)

    return DevTokenResponse(
        access_token=token,
        dev_id=dev.id,
        email=dev.email,
    )


@router.post("/connect-whatsapp")
async def connect_whatsapp_dev(
    dados: DevConnectWhatsAppRequest,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Conectar WhatsApp via Embedded Signup (reutiliza meta_signup)."""
    from app.services.meta_signup import (
        exchange_code_for_token,
        subscribe_app_to_waba,
        register_phone_number,
    )

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    # Trocar code por token
    access_token = await exchange_code_for_token(dados.code)

    # Inscrever app na WABA
    await subscribe_app_to_waba(dados.waba_id, access_token)

    # Registrar numero
    await register_phone_number(dados.phone_number_id, access_token)

    # Salvar credenciais
    dev.whatsapp_token = access_token
    dev.phone_number_id = dados.phone_number_id
    dev.waba_id = dados.waba_id
    db.commit()

    return {
        "sucesso": True,
        "phone_number_id": dados.phone_number_id,
        "waba_id": dados.waba_id,
    }


@router.get("/whatsapp-status")
async def whatsapp_status_dev(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Verifica se o WhatsApp esta conectado."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    return {
        "conectado": bool(dev.whatsapp_token and dev.phone_number_id),
        "phone_number_id": dev.phone_number_id,
        "waba_id": dev.waba_id,
    }


@router.get("/perfil", response_model=DevPerfilResponse)
async def perfil_dev(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Retorna perfil do dev autenticado."""
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    return DevPerfilResponse(
        id=dev.id,
        nome=dev.nome,
        email=dev.email,
        telefone=dev.telefone,
        empresa_nome=dev.empresa_nome,
        status=dev.status,
        trial_inicio=dev.trial_inicio,
        trial_fim=dev.trial_fim,
        whatsapp_conectado=bool(dev.whatsapp_token and dev.phone_number_id),
        phone_number_id=dev.phone_number_id,
        waba_id=dev.waba_id,
        webhook_url=dev.webhook_url,
        criado_em=dev.criado_em,
    )
