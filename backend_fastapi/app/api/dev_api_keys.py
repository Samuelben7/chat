"""
Endpoints de gerenciamento de API Keys para desenvolvedores.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
import secrets
import bcrypt

from app.database.database import get_db
from app.models.models import ApiKey, DevUsuario
from app.schemas.dev import ApiKeyCreateRequest, ApiKeyResponse, ApiKeyCreatedResponse
from app.core.dependencies import CurrentDev

router = APIRouter(prefix="/dev/api-keys", tags=["dev-api-keys"])

MAX_KEYS_PER_DEV = 5


def _hash_api_key(key: str) -> str:
    """Hash de API key com bcrypt."""
    return bcrypt.hashpw(key.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


@router.post("", response_model=ApiKeyCreatedResponse, status_code=201)
async def criar_api_key(
    dados: ApiKeyCreateRequest = None,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """
    Gera nova API key. A key completa e retornada apenas nesta resposta.
    """
    if dados is None:
        dados = ApiKeyCreateRequest()

    # Limite de keys
    count = db.query(ApiKey).filter(
        ApiKey.dev_id == dev_id,
        ApiKey.ativa == True
    ).count()
    if count >= MAX_KEYS_PER_DEV:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de {MAX_KEYS_PER_DEV} API keys ativas atingido"
        )

    # Gerar key
    raw_key = secrets.token_hex(32)  # 64 chars
    prefix = raw_key[:8]
    key_hash = _hash_api_key(raw_key)

    api_key = ApiKey(
        dev_id=dev_id,
        key_prefix=prefix,
        key_hash=key_hash,
        nome=dados.nome,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreatedResponse(
        id=api_key.id,
        key=raw_key,
        key_prefix=prefix,
        nome=api_key.nome,
    )


@router.get("", response_model=List[ApiKeyResponse])
async def listar_api_keys(
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Lista todas as API keys do dev (sem exibir a key completa)."""
    keys = db.query(ApiKey).filter(
        ApiKey.dev_id == dev_id,
        ApiKey.ativa == True
    ).order_by(ApiKey.criada_em.desc()).all()

    return keys


@router.delete("/{key_id}")
async def revogar_api_key(
    key_id: int,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Revoga (desativa) uma API key."""
    api_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.dev_id == dev_id,
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key nao encontrada")

    api_key.ativa = False
    api_key.revogada_em = datetime.utcnow()
    db.commit()

    return {"message": "API key revogada com sucesso"}


@router.post("/{key_id}/rotate", response_model=ApiKeyCreatedResponse)
async def rotacionar_api_key(
    key_id: int,
    dev_id: CurrentDev = None,
    db: Session = Depends(get_db)
):
    """Rotaciona uma API key: revoga a antiga e cria uma nova."""
    old_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.dev_id == dev_id,
        ApiKey.ativa == True,
    ).first()

    if not old_key:
        raise HTTPException(status_code=404, detail="API key nao encontrada")

    # Revogar antiga
    old_key.ativa = False
    old_key.revogada_em = datetime.utcnow()

    # Gerar nova
    raw_key = secrets.token_hex(32)
    prefix = raw_key[:8]
    key_hash = _hash_api_key(raw_key)

    new_key = ApiKey(
        dev_id=dev_id,
        key_prefix=prefix,
        key_hash=key_hash,
        nome=old_key.nome,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    return ApiKeyCreatedResponse(
        id=new_key.id,
        key=raw_key,
        key_prefix=prefix,
        nome=new_key.nome,
        message="Key rotacionada. Salve a nova chave agora.",
    )
