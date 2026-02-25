"""
Endpoints de Autenticação para Empresas e Atendentes
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database.database import get_db
from app.models.models import Empresa, Atendente, EmpresaAuth, AtendenteAuth, TokenConfirmacaoEmail
from app.schemas.auth import (
    LoginEmpresaRequest,
    LoginAtendenteRequest,
    TrocarSenhaRequest,
    TokenResponse,
    UsuarioAtual,
    CriarAtendenteRequest,
    AtendenteResponse,
    RegistroEmpresaRequest,
    RegistroEmpresaResponse,
    ConfirmarEmailRequest,
    ConnectWhatsAppRequest,
    ConnectWhatsAppResponse,
    WhatsAppStatusResponse,
    WhatsAppProfileResponse,
    EmpresaAdminResponse,
)
from app.core.config import settings
from app.core.auth import (
    verificar_senha,
    hash_senha,
    criar_token_empresa,
    criar_token_atendente,
    criar_token_admin,
    decodificar_token,
    validar_permissao_empresa,
    validar_permissao_admin,
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


# ========== DEPENDENCY: Extrair token do header ==========
async def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    """
    Extrai o token JWT do header Authorization
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Formato de token inválido. Use: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return authorization.replace("Bearer ", "")


# ========== LOGIN EMPRESA ==========
@router.post("/empresa/login", response_model=TokenResponse)
async def login_empresa(
    credentials: LoginEmpresaRequest,
    db: Session = Depends(get_db)
):
    """
    Login para empresa (admin/owner)

    - Valida email e senha
    - Retorna token JWT com role='empresa'
    """
    # Buscar autenticação da empresa
    empresa_auth = db.query(EmpresaAuth).filter(
        EmpresaAuth.email == credentials.email
    ).first()

    if not empresa_auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    # Verificar senha
    if not verificar_senha(credentials.senha, empresa_auth.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    # Atualizar último login
    empresa_auth.ultimo_login = datetime.utcnow()
    db.commit()

    # Gerar token — admin recebe role='admin' para acesso ao painel
    is_admin = (
        settings.ADMIN_NOTIFICATION_EMAIL
        and empresa_auth.email == settings.ADMIN_NOTIFICATION_EMAIL
    )
    if is_admin:
        token = criar_token_admin(empresa_auth.empresa_id, empresa_auth.email)
        role = "admin"
    else:
        token = criar_token_empresa(empresa_auth.empresa_id, empresa_auth.email)
        role = "empresa"

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=role,
        empresa_id=empresa_auth.empresa_id,
        primeiro_login=False
    )


# ========== LOGIN ATENDENTE ==========
@router.post("/atendente/login", response_model=TokenResponse)
async def login_atendente(
    credentials: LoginAtendenteRequest,
    db: Session = Depends(get_db)
):
    """
    Login para atendente

    - Valida email e senha
    - Retorna token JWT com role='atendente'
    - Flag 'primeiro_login' indica se precisa trocar senha
    """
    # Buscar autenticação do atendente
    atendente_auth = db.query(AtendenteAuth).filter(
        AtendenteAuth.email == credentials.email
    ).first()

    if not atendente_auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    # Verificar senha
    if not verificar_senha(credentials.senha, atendente_auth.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )

    # Buscar dados do atendente para pegar empresa_id
    atendente = db.query(Atendente).filter(
        Atendente.id == atendente_auth.atendente_id
    ).first()

    if not atendente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dados do atendente não encontrados"
        )

    # Atualizar último login apenas se não for primeiro login
    if not atendente_auth.primeiro_login:
        atendente_auth.ultimo_login = datetime.utcnow()
        db.commit()

    # Gerar token
    token = criar_token_atendente(
        atendente_id=atendente_auth.atendente_id,
        empresa_id=atendente.empresa_id,
        email=atendente_auth.email,
        primeiro_login=atendente_auth.primeiro_login
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role="atendente",
        empresa_id=atendente.empresa_id,
        atendente_id=atendente_auth.atendente_id,
        primeiro_login=atendente_auth.primeiro_login
    )


# ========== TROCAR SENHA (PRIMEIRO LOGIN) ==========
@router.post("/atendente/trocar-senha", response_model=TokenResponse)
async def trocar_senha_primeiro_login(
    nova_senha: TrocarSenhaRequest,
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Troca senha no primeiro login do atendente

    - Requer token válido
    - Atualiza senha e marca primeiro_login como False
    - Retorna novo token sem flag primeiro_login
    """
    # Decodificar token
    payload = decodificar_token(token)

    # Verificar se é atendente
    if payload.get("role") != "atendente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas atendentes podem trocar senha pelo primeiro login"
        )

    atendente_id = payload.get("atendente_id")

    # Buscar autenticação
    atendente_auth = db.query(AtendenteAuth).filter(
        AtendenteAuth.atendente_id == atendente_id
    ).first()

    if not atendente_auth:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Atendente não encontrado"
        )

    # Atualizar senha e marcar como não-primeiro-login
    atendente_auth.senha_hash = hash_senha(nova_senha.senha_nova)
    atendente_auth.primeiro_login = False
    atendente_auth.ultimo_login = datetime.utcnow()
    db.commit()

    # Buscar dados do atendente
    atendente = db.query(Atendente).filter(
        Atendente.id == atendente_id
    ).first()

    # Gerar novo token
    novo_token = criar_token_atendente(
        atendente_id=atendente_id,
        empresa_id=atendente.empresa_id,
        email=atendente_auth.email,
        primeiro_login=False
    )

    return TokenResponse(
        access_token=novo_token,
        token_type="bearer",
        role="atendente",
        empresa_id=atendente.empresa_id,
        atendente_id=atendente_id,
        primeiro_login=False
    )


# ========== VERIFICAR TOKEN ==========
@router.get("/verify", response_model=UsuarioAtual)
async def verificar_token_endpoint(
    token: str = Depends(get_token_from_header)
):
    """
    Verifica se o token JWT é válido

    - Retorna dados do usuário autenticado
    - Usado pelo frontend para validar sessão
    """
    payload = decodificar_token(token)

    return UsuarioAtual(
        email=payload.get("sub"),
        empresa_id=payload.get("empresa_id"),
        role=payload.get("role"),
        atendente_id=payload.get("atendente_id"),
        primeiro_login=payload.get("primeiro_login", False)
    )


# ========== CRIAR ATENDENTE (EMPRESA) ==========
@router.post("/empresa/criar-atendente", response_model=AtendenteResponse)
async def criar_atendente(
    dados: CriarAtendenteRequest,
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Empresa cria novo atendente

    - Requer token de empresa
    - Cria atendente vinculado à empresa
    - Gera credenciais automáticas (senha temporária)
    - TODO: Enviar email com credenciais (Celery task)

    Returns:
        Dados do atendente criado
    """
    # Validar que é uma empresa
    empresa_id = validar_permissao_empresa(token)

    # Verificar se email já existe
    email_existente = db.query(AtendenteAuth).filter(
        AtendenteAuth.email == dados.email
    ).first()

    if email_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )

    # Verificar se CPF já existe (se fornecido)
    if dados.cpf:
        cpf_existente = db.query(Atendente).filter(
            Atendente.cpf == dados.cpf
        ).first()

        if cpf_existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CPF já cadastrado"
            )

    # Gerar senha temporária (primeiras 4 letras do nome + 2026)
    senha_temporaria = dados.nome_exibicao[:4].lower() + "2026"

    # Buscar próximo user_id disponível para esta empresa
    from sqlalchemy import func
    max_user_id = db.query(func.coalesce(func.max(Atendente.user_id), 0)).filter(
        Atendente.empresa_id == empresa_id
    ).scalar()
    next_user_id = max_user_id + 1

    # Criar atendente
    novo_atendente = Atendente(
        empresa_id=empresa_id,
        user_id=next_user_id,
        nome_exibicao=dados.nome_exibicao,
        email=dados.email,
        cpf=dados.cpf,
        data_nascimento=dados.data_nascimento,
        status='offline',
        pode_atender=True
    )

    db.add(novo_atendente)
    db.flush()  # Para pegar o ID

    # Criar autenticação
    nova_auth = AtendenteAuth(
        atendente_id=novo_atendente.id,
        email=dados.email,
        senha_hash=hash_senha(senha_temporaria),
        primeiro_login=True
    )

    db.add(nova_auth)
    db.commit()
    db.refresh(novo_atendente)

    # TODO: Enviar email via Celery task
    # send_credentials_email.delay(dados.email, senha_temporaria)
    print(f"[INFO] Credenciais criadas - Email: {dados.email} | Senha: {senha_temporaria}")

    return AtendenteResponse(
        id=novo_atendente.id,
        empresa_id=novo_atendente.empresa_id,
        nome_exibicao=novo_atendente.nome_exibicao,
        email=novo_atendente.email,
        cpf=novo_atendente.cpf,
        data_nascimento=novo_atendente.data_nascimento.isoformat() if novo_atendente.data_nascimento else None,
        status=novo_atendente.status,
        pode_atender=novo_atendente.pode_atender,
        criado_em=novo_atendente.ultima_atividade
    )


# ========== REGISTRO DE EMPRESA (2 ETAPAS) ==========

@router.post("/empresa/register", response_model=RegistroEmpresaResponse)
async def registrar_empresa(
    dados: RegistroEmpresaRequest,
    db: Session = Depends(get_db)
):
    """
    ETAPA 1: Registra uma nova empresa e envia email de confirmação

    Processo:
    1. Valida se email/CNPJ já existe
    2. Cria empresa (inativa)
    3. Cria auth com senha hasheada
    4. Gera token de confirmação
    5. Envia email via Celery (não bloqueia API) ✨
    """
    # Verificar se email já existe
    email_existe = db.query(EmpresaAuth).filter(
        EmpresaAuth.email == dados.email
    ).first()

    if email_existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )

    # Verificar CNPJ (se fornecido)
    if dados.cnpj:
        cnpj_existe = db.query(Empresa).filter(
            Empresa.cnpj == dados.cnpj
        ).first()

        if cnpj_existe:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CNPJ já cadastrado"
            )

    # Criar empresa (INATIVA até confirmar email)
    import uuid
    nova_empresa = Empresa(
        nome=dados.nome,
        cnpj=dados.cnpj,
        email=dados.email,
        telefone=dados.telefone,
        whatsapp_token=dados.whatsapp_token or "TOKEN_PENDENTE",
        phone_number_id=dados.phone_number_id or f"PENDENTE_{uuid.uuid4().hex[:12]}",
        verify_token=f"verify_{hash_senha(dados.email)[:32]}",
        ativa=False  # ❗ Inativa até confirmar email
    )

    db.add(nova_empresa)
    db.flush()

    # Criar autenticação
    nova_auth = EmpresaAuth(
        empresa_id=nova_empresa.id,
        email=dados.email,
        senha_hash=hash_senha(dados.senha)
    )

    db.add(nova_auth)

    # Gerar token de confirmação
    from app.services.email_service import gerar_token_confirmacao
    from datetime import timedelta

    token = gerar_token_confirmacao()
    expira_em = datetime.utcnow() + timedelta(hours=24)

    token_confirmacao = TokenConfirmacaoEmail(
        email=dados.email,
        token=token,
        empresa_id=nova_empresa.id,
        usado=False,
        expira_em=expira_em
    )

    db.add(token_confirmacao)
    db.commit()

    # Enviar email via Celery (ASSÍNCRONO - NÃO BLOQUEIA) 🚀
    try:
        from app.tasks.tasks import enviar_email_confirmacao_task
        enviar_email_confirmacao_task.delay(
            destinatario=dados.email,
            nome_empresa=dados.nome,
            token=token
        )
        print(f"✅ Task de email enviada para Celery - Email: {dados.email}")
    except Exception as e:
        print(f"⚠️  Celery não disponível, enviando sync: {e}")
        # Fallback: envia síncrono se Celery não estiver disponível
        from app.services.email_service import enviar_email_confirmacao
        enviar_email_confirmacao(dados.email, dados.nome, token)

    return RegistroEmpresaResponse(
        mensagem="Cadastro realizado! Verifique seu email para ativar a conta.",
        email=dados.email,
        empresa_id=nova_empresa.id
    )


@router.post("/empresa/confirm-email")
async def confirmar_email(
    dados: ConfirmarEmailRequest,
    db: Session = Depends(get_db)
):
    """
    ETAPA 2: Confirma o email da empresa via token

    Processo:
    1. Valida token (existe, não usado, não expirado)
    2. Ativa a empresa
    3. Marca token como usado
    """
    # Buscar token
    token_obj = db.query(TokenConfirmacaoEmail).filter(
        TokenConfirmacaoEmail.token == dados.token,
        TokenConfirmacaoEmail.usado == False
    ).first()

    if not token_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou já utilizado"
        )

    # Verificar expiração
    if datetime.utcnow() > token_obj.expira_em:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token expirado. Solicite um novo cadastro."
        )

    # Ativar empresa
    empresa = db.query(Empresa).filter(
        Empresa.id == token_obj.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    empresa.ativa = True

    # Marcar token como usado
    token_obj.usado = True

    db.commit()

    print(f"✅ Email confirmado - Empresa: {empresa.nome} (ID: {empresa.id})")

    return {
        "mensagem": "Email confirmado com sucesso! Agora você pode fazer login.",
        "empresa_id": empresa.id,
        "empresa_nome": empresa.nome
    }


# ========== CONNECT WHATSAPP (EMBEDDED SIGNUP) ==========

@router.post("/empresa/connect-whatsapp", response_model=ConnectWhatsAppResponse)
async def connect_whatsapp(
    dados: ConnectWhatsAppRequest,
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Conecta WhatsApp via Meta Embedded Signup.

    1. Troca code por access_token (server-side)
    2. Inscreve app na WABA
    3. Registra número no Cloud API
    4. Salva credenciais na empresa
    5. Notifica admin
    """
    empresa_id = validar_permissao_empresa(token)

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    # 1. Trocar code por access_token
    from app.services.meta_signup import (
        exchange_code_for_token,
        subscribe_app_to_waba,
        register_phone_number,
    )

    try:
        access_token = await exchange_code_for_token(dados.code)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao obter token da Meta: {str(e)}"
        )

    # 2. Inscrever app na WABA (falha não é fatal)
    subscribe_ok = False
    try:
        subscribe_ok = await subscribe_app_to_waba(dados.waba_id, access_token)
        if subscribe_ok:
            print(f"[INFO] Subscribe WABA OK: {dados.waba_id}")
        else:
            print(f"[WARN] Subscribe WABA falhou (token sem whatsapp_business_management?) — será retentado automaticamente")
    except Exception as e:
        print(f"[WARN] Erro ao inscrever app na WABA: {e}")

    # 3. Registrar número (falha não é fatal — pode estar em PENDING review)
    try:
        register_ok = await register_phone_number(dados.phone_number_id, access_token)
        if register_ok:
            print(f"[INFO] Register phone OK: {dados.phone_number_id}")
        else:
            print(f"[WARN] Register phone falhou — provavelmente WABA em revisão (account_review_status=PENDING). Task de retry irá tentar novamente a cada 4h.")
    except Exception as e:
        print(f"[WARN] Erro ao registrar número: {e}")

    # 4. Salvar credenciais
    empresa.whatsapp_token = access_token
    empresa.phone_number_id = dados.phone_number_id
    empresa.waba_id = dados.waba_id
    db.commit()

    print(f"[INFO] WhatsApp conectado - Empresa: {empresa.nome} | WABA: {dados.waba_id} | Phone: {dados.phone_number_id}")

    # 5. Notificar admin via Celery
    try:
        from app.tasks.tasks import notificar_admin_nova_empresa_task
        notificar_admin_nova_empresa_task.delay(
            empresa_id=empresa.id,
            nome=empresa.nome,
            email=empresa.email,
            waba_id=dados.waba_id,
            phone_number_id=dados.phone_number_id
        )
    except Exception as e:
        print(f"[WARN] Erro ao disparar notificação admin: {e}")

    return ConnectWhatsAppResponse(
        mensagem="WhatsApp conectado com sucesso!",
        phone_number_id=dados.phone_number_id,
        waba_id=dados.waba_id,
        conectado=True
    )


# ========== WHATSAPP STATUS ==========

@router.get("/empresa/whatsapp-status", response_model=WhatsAppStatusResponse)
async def whatsapp_status(
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Retorna status da conexão WhatsApp da empresa.
    """
    empresa_id = validar_permissao_empresa(token)

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    conectado = (
        empresa.whatsapp_token is not None
        and empresa.whatsapp_token != "TOKEN_PENDENTE"
        and not empresa.phone_number_id.startswith("PENDENTE_")
    )

    return WhatsAppStatusResponse(
        conectado=conectado,
        phone_number_id=empresa.phone_number_id if conectado else None,
        waba_id=empresa.waba_id if conectado else None,
    )


# ========== ADMIN PANEL ==========

@router.get("/admin/empresas", response_model=list[EmpresaAdminResponse])
async def listar_empresas_admin(
    admin_key: str = None,
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Lista todas as empresas cadastradas (painel admin).
    Requer ADMIN_SECRET_KEY ou ser o admin configurado.
    """
    payload = decodificar_token(token)
    email = payload.get("sub")

    # Verificar se é admin: por email configurado ou por admin_key
    is_admin = False
    if settings.ADMIN_NOTIFICATION_EMAIL and email == settings.ADMIN_NOTIFICATION_EMAIL:
        is_admin = True
    if settings.ADMIN_SECRET_KEY and admin_key == settings.ADMIN_SECRET_KEY:
        is_admin = True

    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao administrador"
        )

    empresas = db.query(Empresa).order_by(Empresa.id.desc()).all()

    result = []
    for emp in empresas:
        conectado = (
            emp.whatsapp_token is not None
            and emp.whatsapp_token != "TOKEN_PENDENTE"
            and emp.phone_number_id is not None
            and not emp.phone_number_id.startswith("PENDENTE_")
        )
        result.append(EmpresaAdminResponse(
            id=emp.id,
            nome=emp.nome,
            cnpj=emp.cnpj,
            email=emp.email,
            telefone=emp.telefone,
            ativa=emp.ativa,
            whatsapp_conectado=conectado,
            phone_number_id=emp.phone_number_id if conectado else None,
            waba_id=emp.waba_id if conectado else None,
            criado_em=emp.criada_em if hasattr(emp, 'criada_em') else None,
        ))

    return result


# ========== WHATSAPP PROFILE (EMPRESA) ==========

@router.get("/empresa/whatsapp-profile", response_model=WhatsAppProfileResponse)
async def whatsapp_profile_empresa(
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Retorna status + perfil do WhatsApp da empresa logada via Meta API.
    """
    payload = decodificar_token(token)
    role = payload.get("role")
    if role not in ("empresa", "admin"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    empresa_id = payload.get("empresa_id")
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    conectado = (
        empresa.whatsapp_token is not None
        and empresa.whatsapp_token != "TOKEN_PENDENTE"
        and empresa.phone_number_id is not None
        and not empresa.phone_number_id.startswith("PENDENTE_")
    )

    if not conectado:
        return WhatsAppProfileResponse(conectado=False)

    from app.services.meta_signup import get_phone_number_info, get_business_profile

    phone_info = {}
    biz_profile = {}

    try:
        phone_info = await get_phone_number_info(empresa.phone_number_id, empresa.whatsapp_token)
    except Exception as e:
        print(f"[WARN] Erro ao buscar phone info: {e}")

    try:
        biz_profile = await get_business_profile(empresa.phone_number_id, empresa.whatsapp_token)
    except Exception as e:
        print(f"[WARN] Erro ao buscar biz profile: {e}")

    return WhatsAppProfileResponse(
        conectado=True,
        phone_number_id=empresa.phone_number_id,
        waba_id=empresa.waba_id,
        display_phone_number=phone_info.get("display_phone_number"),
        verified_name=phone_info.get("verified_name"),
        status=phone_info.get("status"),
        quality_rating=phone_info.get("quality_rating"),
        name_status=phone_info.get("name_status"),
        about=biz_profile.get("about"),
        profile_picture_url=biz_profile.get("profile_picture_url"),
    )


# ========== WHATSAPP PROFILE (ADMIN) ==========

@router.get("/admin/empresa/{empresa_id}/whatsapp-profile", response_model=WhatsAppProfileResponse)
async def whatsapp_profile_admin(
    empresa_id: int,
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db)
):
    """
    Admin: retorna status + perfil + token (preview) de qualquer empresa.
    """
    validar_permissao_admin(token)

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    conectado = (
        empresa.whatsapp_token is not None
        and empresa.whatsapp_token != "TOKEN_PENDENTE"
        and empresa.phone_number_id is not None
        and not empresa.phone_number_id.startswith("PENDENTE_")
    )

    if not conectado:
        return WhatsAppProfileResponse(conectado=False)

    from app.services.meta_signup import get_phone_number_info, get_business_profile

    phone_info = {}
    biz_profile = {}

    try:
        phone_info = await get_phone_number_info(empresa.phone_number_id, empresa.whatsapp_token)
    except Exception as e:
        print(f"[WARN] Admin - Erro ao buscar phone info empresa {empresa_id}: {e}")

    try:
        biz_profile = await get_business_profile(empresa.phone_number_id, empresa.whatsapp_token)
    except Exception as e:
        print(f"[WARN] Admin - Erro ao buscar biz profile empresa {empresa_id}: {e}")

    # Token preview: primeiros 30 caracteres para suporte
    token_preview = empresa.whatsapp_token[:40] + "..." if empresa.whatsapp_token else None

    return WhatsAppProfileResponse(
        conectado=True,
        phone_number_id=empresa.phone_number_id,
        waba_id=empresa.waba_id,
        display_phone_number=phone_info.get("display_phone_number"),
        verified_name=phone_info.get("verified_name"),
        status=phone_info.get("status"),
        quality_rating=phone_info.get("quality_rating"),
        name_status=phone_info.get("name_status"),
        about=biz_profile.get("about"),
        profile_picture_url=biz_profile.get("profile_picture_url"),
        token_preview=token_preview,
    )
