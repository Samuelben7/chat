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
)
from app.core.auth import (
    verificar_senha,
    hash_senha,
    criar_token_empresa,
    criar_token_atendente,
    decodificar_token,
    validar_permissao_empresa,
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

    # Gerar token
    token = criar_token_empresa(empresa_auth.empresa_id, empresa_auth.email)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role="empresa",
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
