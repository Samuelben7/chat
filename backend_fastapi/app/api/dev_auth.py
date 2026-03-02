"""
Endpoints de autenticacao para desenvolvedores (API Gateway).
"""
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets

from app.database.database import get_db
from app.models.models import DevUsuario, DevAuth, TokenResetSenha, TokenConfirmacaoEmailDev
from app.schemas.dev import (
    DevRegistroRequest, DevRegistroResponse, DevLoginRequest, DevTokenResponse,
    DevConnectWhatsAppRequest, DevPerfilResponse,
    DevEsqueciSenhaRequest, DevRedefinirSenhaRequest, DevConfirmarEmailRequest,
)
from app.core.auth import hash_senha, verificar_senha, criar_token_dev
from app.core.dependencies import CurrentDev
from app.core.config import settings

router = APIRouter(prefix="/auth/dev", tags=["dev-auth"])


@router.post("/register", response_model=DevRegistroResponse, status_code=201)
async def registrar_dev(dados: DevRegistroRequest, db: Session = Depends(get_db)):
    """Registra novo desenvolvedor. Conta inativa até confirmar email."""
    # Verificar email duplicado
    existing = db.query(DevAuth).filter(DevAuth.email == dados.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email ja cadastrado"
        )

    # Criar DevUsuario (INATIVO até confirmar email)
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
        ativo=False,  # ❗ Inativo até confirmar email
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

    # Gerar token de confirmação
    from app.services.email_service import gerar_token_confirmacao
    token_str = gerar_token_confirmacao()
    expira_em = datetime.utcnow() + timedelta(hours=24)

    token_confirmacao = TokenConfirmacaoEmailDev(
        dev_id=dev.id,
        email=dados.email,
        token=token_str,
        usado=False,
        expira_em=expira_em,
    )
    db.add(token_confirmacao)
    db.commit()
    db.refresh(dev)

    # Enviar email de confirmação via Celery
    try:
        from app.tasks.tasks import enviar_email_confirmacao_dev_task
        enviar_email_confirmacao_dev_task.delay(
            destinatario=dados.email,
            nome_dev=dados.nome,
            token=token_str,
        )
    except Exception as e:
        print(f"⚠️  Celery não disponível, enviando sync: {e}")
        from app.services.email_service import enviar_email_confirmacao_dev
        enviar_email_confirmacao_dev(dados.email, dados.nome, token_str)

    return DevRegistroResponse(
        mensagem="Cadastro realizado! Verifique seu email para ativar sua conta de desenvolvedor.",
        email=dados.email,
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
        assign_system_user_to_waba,
        register_phone_number,
    )
    from app.core.config import settings

    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev nao encontrado")

    # Trocar code por token
    access_token = await exchange_code_for_token(dados.code)

    # Atribuir System User da plataforma ao WABA do dev (Full Control)
    if settings.META_SYSTEM_USER_ID:
        try:
            await assign_system_user_to_waba(dados.waba_id, access_token, settings.META_SYSTEM_USER_ID)
        except Exception as e:
            print(f"[WARN] Erro ao atribuir System User ao WABA do dev: {e}")

    # Inscrever app na WABA (usa platform token permanente se disponível)
    subscribe_token = settings.META_PLATFORM_TOKEN if settings.META_PLATFORM_TOKEN else access_token
    await subscribe_app_to_waba(dados.waba_id, subscribe_token)

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


# ========== CONFIRMAR EMAIL DEV ==========

@router.post("/confirm-email")
async def confirmar_email_dev(
    dados: DevConfirmarEmailRequest,
    db: Session = Depends(get_db)
):
    """Confirma o email do desenvolvedor e ativa sua conta."""
    token_obj = db.query(TokenConfirmacaoEmailDev).filter(
        TokenConfirmacaoEmailDev.token == dados.token,
        TokenConfirmacaoEmailDev.usado == False,
    ).first()

    if not token_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou já utilizado"
        )

    if datetime.utcnow() > token_obj.expira_em:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token expirado. Faça um novo cadastro."
        )

    dev = db.query(DevUsuario).filter(DevUsuario.id == token_obj.dev_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Dev não encontrado")

    dev.ativo = True
    token_obj.usado = True
    db.commit()

    print(f"✅ Email dev confirmado: {dev.email} (ID: {dev.id})")

    return {
        "mensagem": "Email confirmado! Sua conta está ativa. Você já pode fazer login.",
        "dev_id": dev.id,
        "email": dev.email,
    }


# ========== RECUPERAÇÃO DE SENHA DEV ==========

@router.post("/esqueci-senha")
async def esqueci_senha_dev(
    dados: DevEsqueciSenhaRequest,
    db: Session = Depends(get_db)
):
    """Solicita recuperação de senha para desenvolvedor. Sempre retorna mensagem genérica."""
    RESPOSTA_GENERICA = {
        "mensagem": "Se esse email estiver cadastrado, você receberá as instruções em breve."
    }

    auth = db.query(DevAuth).filter(DevAuth.email == dados.email).first()
    if not auth:
        return RESPOSTA_GENERICA

    dev = db.query(DevUsuario).filter(DevUsuario.id == auth.dev_id).first()
    nome = dev.nome if dev else dados.email

    from app.services.email_service import gerar_token_confirmacao
    token_str = gerar_token_confirmacao()
    expira_em = datetime.utcnow() + timedelta(hours=1)

    token_reset = TokenResetSenha(
        email=dados.email,
        token=token_str,
        tipo="dev",
        usado=False,
        expira_em=expira_em,
    )
    db.add(token_reset)
    db.commit()

    try:
        from app.tasks.tasks import enviar_email_reset_senha_task
        enviar_email_reset_senha_task.delay(
            destinatario=dados.email,
            nome=nome,
            token=token_str,
            tipo_usuario="dev",
        )
    except Exception as e:
        print(f"⚠️  Celery não disponível, enviando sync: {e}")
        from app.services.email_service import enviar_email_reset_senha
        enviar_email_reset_senha(dados.email, nome, token_str, "dev")

    return RESPOSTA_GENERICA


@router.post("/redefinir-senha")
async def redefinir_senha_dev(
    dados: DevRedefinirSenhaRequest,
    db: Session = Depends(get_db)
):
    """Redefine a senha do dev usando um token válido."""
    token_obj = db.query(TokenResetSenha).filter(
        TokenResetSenha.token == dados.token,
        TokenResetSenha.usado == False,
        TokenResetSenha.tipo == "dev",
    ).first()

    if not token_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou já utilizado"
        )

    if datetime.utcnow() > token_obj.expira_em:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token expirado. Solicite uma nova recuperação de senha."
        )

    auth = db.query(DevAuth).filter(DevAuth.email == token_obj.email).first()
    if not auth:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    auth.senha_hash = hash_senha(dados.nova_senha)
    token_obj.usado = True
    db.commit()

    return {"mensagem": "Senha redefinida com sucesso! Você já pode fazer login."}
