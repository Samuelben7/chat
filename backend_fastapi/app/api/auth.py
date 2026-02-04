"""
Endpoints de Autenticação para Empresas e Atendentes
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database.database import get_db
from app.models.models import Empresa, Atendente, EmpresaAuth, AtendenteAuth
from app.schemas.auth import (
    LoginEmpresaRequest,
    LoginAtendenteRequest,
    TrocarSenhaRequest,
    TokenResponse,
    UsuarioAtual,
    CriarAtendenteRequest,
    AtendenteResponse,
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

    # Criar atendente
    novo_atendente = Atendente(
        empresa_id=empresa_id,
        user_id=0,  # TODO: Ajustar quando necessário
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
