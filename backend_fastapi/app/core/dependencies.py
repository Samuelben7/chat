"""
Dependencies FastAPI para Autenticação e Autorização
Facilita a validação de tokens e permissões em rotas protegidas
"""

from typing import Annotated, Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.core.auth import (
    decodificar_token,
    extrair_empresa_id,
    extrair_atendente_id,
    extrair_role,
    validar_permissao_empresa,
    validar_permissao_atendente,
)


# ========== DEPENDENCY: Extrair Token ==========
async def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    """
    Extrai o token JWT do header Authorization

    Raises:
        HTTPException: Se token não fornecido ou formato inválido

    Returns:
        Token JWT (sem o prefixo "Bearer ")
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


# ========== DEPENDENCY: Usuário Atual (qualquer role) ==========
class UsuarioAtualDep:
    """
    Dependency que retorna informações do usuário autenticado (empresa ou atendente)
    """
    def __init__(self):
        self.email: str = ""
        self.empresa_id: int = 0
        self.role: str = ""
        self.atendente_id: Optional[int] = None
        self.primeiro_login: bool = False


async def get_current_user(
    token: str = Depends(get_token_from_header)
) -> UsuarioAtualDep:
    """
    Retorna dados do usuário autenticado (empresa ou atendente)

    Args:
        token: Token JWT extraído do header

    Returns:
        UsuarioAtualDep com dados do usuário
    """
    payload = decodificar_token(token)

    user = UsuarioAtualDep()
    user.email = payload.get("sub", "")
    user.empresa_id = payload.get("empresa_id", 0)
    user.role = payload.get("role", "")
    user.atendente_id = payload.get("atendente_id")
    user.primeiro_login = payload.get("primeiro_login", False)

    return user


# ========== DEPENDENCY: Apenas Empresa ==========
async def get_current_empresa(
    token: str = Depends(get_token_from_header)
) -> int:
    """
    Valida que o usuário é uma empresa e retorna o empresa_id

    Use em rotas que apenas empresas podem acessar

    Args:
        token: Token JWT

    Returns:
        empresa_id da empresa autenticada

    Raises:
        HTTPException 403: Se não for empresa
    """
    return validar_permissao_empresa(token)


# ========== DEPENDENCY: Apenas Atendente ==========
class AtendenteAtualDep:
    """Dados do atendente autenticado"""
    def __init__(self, atendente_id: int, empresa_id: int):
        self.atendente_id = atendente_id
        self.empresa_id = empresa_id


async def get_current_atendente(
    token: str = Depends(get_token_from_header)
) -> AtendenteAtualDep:
    """
    Valida que o usuário é um atendente e retorna seus dados

    Use em rotas que apenas atendentes podem acessar

    Args:
        token: Token JWT

    Returns:
        AtendenteAtualDep com atendente_id e empresa_id

    Raises:
        HTTPException 403: Se não for atendente
    """
    atendente_id, empresa_id = validar_permissao_atendente(token)
    return AtendenteAtualDep(atendente_id, empresa_id)


# ========== DEPENDENCY: Empresa ou Atendente ==========
async def get_empresa_id_from_token(
    token: str = Depends(get_token_from_header)
) -> int:
    """
    Extrai empresa_id do token (funciona para empresa ou atendente)

    Use quando a rota pode ser acessada por ambos mas precisa do empresa_id

    Args:
        token: Token JWT

    Returns:
        empresa_id
    """
    return extrair_empresa_id(token)


# ========== TYPE ANNOTATIONS (para facilitar uso) ==========

# Usuário atual (qualquer role)
CurrentUser = Annotated[UsuarioAtualDep, Depends(get_current_user)]

# Apenas empresa (retorna empresa_id)
CurrentEmpresa = Annotated[int, Depends(get_current_empresa)]

# Apenas atendente (retorna AtendenteAtualDep)
CurrentAtendente = Annotated[AtendenteAtualDep, Depends(get_current_atendente)]

# Empresa ID do token (empresa ou atendente)
EmpresaIdFromToken = Annotated[int, Depends(get_empresa_id_from_token)]


# ========== EXEMPLO DE USO ==========
"""
# Rota que qualquer usuário autenticado pode acessar:
@router.get("/perfil")
async def meu_perfil(user: CurrentUser):
    return {
        "email": user.email,
        "role": user.role,
        "empresa_id": user.empresa_id
    }

# Rota apenas para empresas:
@router.get("/dashboard")
async def dashboard_empresa(empresa_id: CurrentEmpresa):
    # empresa_id é validado automaticamente
    return {"empresa_id": empresa_id}

# Rota apenas para atendentes:
@router.get("/meus-chats")
async def meus_chats(atendente: CurrentAtendente):
    # Atendente validado, pode usar atendente.atendente_id
    return {"atendente_id": atendente.atendente_id}

# Rota para ambos (precisa apenas do empresa_id):
@router.get("/conversas")
async def listar_conversas(
    empresa_id: EmpresaIdFromToken,
    user: CurrentUser,
    db: Session = Depends(get_db)
):
    # Empresa vê todas, atendente vê filtrado depois
    if user.role == "atendente":
        # Filtrar por atendente_id
        pass
    # Retornar dados filtrados por empresa_id
    return {}
"""
