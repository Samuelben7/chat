"""
API para Modelos de Mensagem — templates customizados do usuário para envio em massa.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database.database import get_db
from app.models.models import ModeloMensagem
from app.core.dependencies import CurrentEmpresa

router = APIRouter(prefix="/modelos-mensagem", tags=["Modelos de Mensagem"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ModeloCreate(BaseModel):
    nome: str
    tipo: str = "text"
    mensagem: str
    header: Optional[str] = None
    footer: Optional[str] = None
    media_url: Optional[str] = None
    buttons: Optional[list] = None
    button_text: Optional[str] = None
    sections: Optional[list] = None


class ModeloUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    mensagem: Optional[str] = None
    header: Optional[str] = None
    footer: Optional[str] = None
    media_url: Optional[str] = None
    buttons: Optional[list] = None
    button_text: Optional[str] = None
    sections: Optional[list] = None


class ModeloResponse(BaseModel):
    id: int
    nome: str
    tipo: str
    mensagem: str
    header: Optional[str]
    footer: Optional[str]
    media_url: Optional[str]
    buttons: Optional[list]
    button_text: Optional[str]
    sections: Optional[list]
    criado_em: Optional[datetime]
    atualizado_em: Optional[datetime]

    model_config = {"from_attributes": True}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ModeloResponse])
async def listar_modelos(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Lista todos os modelos de mensagem da empresa."""
    modelos = db.query(ModeloMensagem).filter(
        ModeloMensagem.empresa_id == empresa_id
    ).order_by(ModeloMensagem.criado_em.desc()).all()
    return modelos


@router.post("", response_model=ModeloResponse, status_code=status.HTTP_201_CREATED)
async def criar_modelo(
    dados: ModeloCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Cria um novo modelo de mensagem."""
    modelo = ModeloMensagem(empresa_id=empresa_id, **dados.model_dump())
    db.add(modelo)
    db.commit()
    db.refresh(modelo)
    return modelo


@router.get("/{modelo_id}", response_model=ModeloResponse)
async def obter_modelo(
    modelo_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Obtém um modelo de mensagem pelo ID."""
    modelo = db.query(ModeloMensagem).filter(
        ModeloMensagem.id == modelo_id,
        ModeloMensagem.empresa_id == empresa_id,
    ).first()
    if not modelo:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")
    return modelo


@router.patch("/{modelo_id}", response_model=ModeloResponse)
async def atualizar_modelo(
    modelo_id: int,
    dados: ModeloUpdate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Atualiza um modelo de mensagem."""
    modelo = db.query(ModeloMensagem).filter(
        ModeloMensagem.id == modelo_id,
        ModeloMensagem.empresa_id == empresa_id,
    ).first()
    if not modelo:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(modelo, campo, valor)

    db.commit()
    db.refresh(modelo)
    return modelo


@router.delete("/{modelo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_modelo(
    modelo_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Deleta um modelo de mensagem."""
    modelo = db.query(ModeloMensagem).filter(
        ModeloMensagem.id == modelo_id,
        ModeloMensagem.empresa_id == empresa_id,
    ).first()
    if not modelo:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")

    db.delete(modelo)
    db.commit()
