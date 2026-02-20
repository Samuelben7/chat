"""
Módulo de Autenticação JWT para o Sistema Multi-tenant
Gerencia tokens JWT, hash de senhas e validação de credenciais
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt
from fastapi import HTTPException, status

# Configuração de segurança
SECRET_KEY = "your-secret-key-change-in-production-2026"  # TODO: Mover para variável de ambiente
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas


def hash_senha(senha: str) -> str:
    """
    Gera hash bcrypt de uma senha

    Args:
        senha: Senha em texto puro

    Returns:
        Hash da senha
    """
    senha_bytes = senha.encode('utf-8')
    salt = bcrypt.gensalt()
    hash_bytes = bcrypt.hashpw(senha_bytes, salt)
    return hash_bytes.decode('utf-8')


def verificar_senha(senha_plana: str, senha_hash: str) -> bool:
    """
    Verifica se a senha plana corresponde ao hash

    Args:
        senha_plana: Senha em texto puro
        senha_hash: Hash armazenado no banco

    Returns:
        True se a senha está correta, False caso contrário
    """
    senha_bytes = senha_plana.encode('utf-8')
    hash_bytes = senha_hash.encode('utf-8')
    return bcrypt.checkpw(senha_bytes, hash_bytes)


def criar_token_acesso(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Cria um token JWT com os dados fornecidos

    Args:
        data: Dados a serem codificados no token (empresa_id, role, etc)
        expires_delta: Tempo de expiração customizado (opcional)

    Returns:
        Token JWT assinado
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def decodificar_token(token: str) -> Dict[str, Any]:
    """
    Decodifica e valida um token JWT

    Args:
        token: Token JWT a ser decodificado

    Returns:
        Dados contidos no token

    Raises:
        HTTPException: Se o token for inválido ou expirado
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


def criar_token_empresa(empresa_id: int, email: str) -> str:
    """
    Cria token JWT específico para empresa

    Args:
        empresa_id: ID da empresa
        email: Email do admin da empresa

    Returns:
        Token JWT
    """
    data = {
        "sub": email,
        "empresa_id": empresa_id,
        "role": "empresa",
        "type": "access"
    }
    return criar_token_acesso(data)


def criar_token_atendente(atendente_id: int, empresa_id: int, email: str, primeiro_login: bool = False) -> str:
    """
    Cria token JWT específico para atendente

    Args:
        atendente_id: ID do atendente
        empresa_id: ID da empresa do atendente
        email: Email do atendente
        primeiro_login: Se é o primeiro login (precisa trocar senha)

    Returns:
        Token JWT
    """
    data = {
        "sub": email,
        "atendente_id": atendente_id,
        "empresa_id": empresa_id,
        "role": "atendente",
        "primeiro_login": primeiro_login,
        "type": "access"
    }
    return criar_token_acesso(data)


def extrair_empresa_id(token: str) -> int:
    """
    Extrai o empresa_id de um token JWT

    Args:
        token: Token JWT

    Returns:
        ID da empresa

    Raises:
        HTTPException: Se o token não contiver empresa_id
    """
    payload = decodificar_token(token)
    empresa_id = payload.get("empresa_id")

    if not empresa_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não contém empresa_id"
        )

    return empresa_id


def extrair_atendente_id(token: str) -> int:
    """
    Extrai o atendente_id de um token JWT

    Args:
        token: Token JWT

    Returns:
        ID do atendente

    Raises:
        HTTPException: Se o token não contiver atendente_id
    """
    payload = decodificar_token(token)
    atendente_id = payload.get("atendente_id")

    if not atendente_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não contém atendente_id (apenas para atendentes)"
        )

    return atendente_id


def extrair_role(token: str) -> str:
    """
    Extrai a role (empresa ou atendente) de um token JWT

    Args:
        token: Token JWT

    Returns:
        Role do usuário ('empresa' ou 'atendente')

    Raises:
        HTTPException: Se o token não contiver role
    """
    payload = decodificar_token(token)
    role = payload.get("role")

    if not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não contém role"
        )

    return role


def verificar_primeiro_login(token: str) -> bool:
    """
    Verifica se é o primeiro login do atendente (precisa trocar senha)

    Args:
        token: Token JWT

    Returns:
        True se for primeiro login, False caso contrário
    """
    payload = decodificar_token(token)
    return payload.get("primeiro_login", False)


def validar_permissao_empresa(token: str) -> int:
    """
    Valida que o token é de uma empresa e retorna o empresa_id

    Args:
        token: Token JWT

    Returns:
        ID da empresa

    Raises:
        HTTPException: Se não for token de empresa
    """
    role = extrair_role(token)
    if role != "empresa":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso permitido apenas para empresas"
        )

    return extrair_empresa_id(token)


def criar_token_admin(empresa_id: int, email: str) -> str:
    """Cria token JWT para o administrador do sistema"""
    data = {
        "sub": email,
        "empresa_id": empresa_id,
        "role": "admin",
        "type": "access"
    }
    return criar_token_acesso(data)


def validar_permissao_admin(token: str) -> None:
    """Valida que o token é do administrador do sistema"""
    payload = decodificar_token(token)
    role = payload.get("role")
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao administrador do sistema"
        )


def validar_permissao_atendente(token: str) -> tuple[int, int]:
    """
    Valida que o token é de um atendente e retorna atendente_id e empresa_id

    Args:
        token: Token JWT

    Returns:
        Tupla (atendente_id, empresa_id)

    Raises:
        HTTPException: Se não for token de atendente
    """
    role = extrair_role(token)
    if role != "atendente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso permitido apenas para atendentes"
        )

    atendente_id = extrair_atendente_id(token)
    empresa_id = extrair_empresa_id(token)

    return atendente_id, empresa_id
