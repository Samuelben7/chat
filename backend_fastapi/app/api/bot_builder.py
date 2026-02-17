"""
API para Bot Builder - Criação visual de fluxos de bot
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.database.database import get_db
from app.models.models import BotFluxo, BotFluxoNo, BotFluxoOpcao, Empresa
from app.schemas.bot_builder import (
    BotFluxoCreate,
    BotFluxoUpdate,
    BotFluxoResponse,
    BotFluxoDetalhado,
    BotFluxoAtivar,
    BotFluxoNoCreate,
    BotFluxoNoUpdate,
    BotFluxoNoResponse,
    BotFluxoOpcaoCreate,
    BotFluxoOpcaoUpdate,
    BotFluxoOpcaoResponse,
)
from app.core.dependencies import CurrentEmpresa

router = APIRouter(prefix="/bot-builder", tags=["Bot Builder"])


# ==================== FLUXOS ====================

@router.get("/fluxos", response_model=List[BotFluxoResponse])
async def listar_fluxos(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Lista todos os fluxos da empresa"""
    fluxos = db.query(BotFluxo).filter(
        BotFluxo.empresa_id == empresa_id
    ).order_by(BotFluxo.criado_em.desc()).all()

    return fluxos


@router.post("/fluxos", response_model=BotFluxoResponse, status_code=status.HTTP_201_CREATED)
async def criar_fluxo(
    fluxo: BotFluxoCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Cria um novo fluxo de bot"""
    # Verificar se já existe fluxo com mesmo nome
    existe = db.query(BotFluxo).filter(
        BotFluxo.empresa_id == empresa_id,
        BotFluxo.nome == fluxo.nome
    ).first()

    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Já existe um fluxo com o nome '{fluxo.nome}'"
        )

    novo_fluxo = BotFluxo(
        empresa_id=empresa_id,
        **fluxo.model_dump()
    )

    db.add(novo_fluxo)
    db.commit()
    db.refresh(novo_fluxo)

    return novo_fluxo


@router.get("/fluxos/{fluxo_id}", response_model=BotFluxoDetalhado)
async def obter_fluxo(
    fluxo_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Obtém detalhes completos de um fluxo com todos os nós e opções"""
    fluxo = db.query(BotFluxo).options(
        joinedload(BotFluxo.nos).joinedload(BotFluxoNo.opcoes)
    ).filter(
        BotFluxo.id == fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not fluxo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fluxo não encontrado"
        )

    return fluxo


@router.patch("/fluxos/{fluxo_id}", response_model=BotFluxoResponse)
async def atualizar_fluxo(
    fluxo_id: int,
    dados: BotFluxoUpdate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Atualiza um fluxo"""
    fluxo = db.query(BotFluxo).filter(
        BotFluxo.id == fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not fluxo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fluxo não encontrado"
        )

    # Atualizar campos
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(fluxo, campo, valor)

    db.commit()
    db.refresh(fluxo)

    return fluxo


@router.delete("/fluxos/{fluxo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_fluxo(
    fluxo_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Deleta um fluxo"""
    fluxo = db.query(BotFluxo).filter(
        BotFluxo.id == fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not fluxo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fluxo não encontrado"
        )

    db.delete(fluxo)
    db.commit()


@router.post("/fluxos/{fluxo_id}/ativar", response_model=BotFluxoResponse)
async def ativar_desativar_fluxo(
    fluxo_id: int,
    dados: BotFluxoAtivar,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Ativa ou desativa um fluxo"""
    fluxo = db.query(BotFluxo).filter(
        BotFluxo.id == fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not fluxo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fluxo não encontrado"
        )

    # Se ativando, desativar outros fluxos
    if dados.ativo:
        db.query(BotFluxo).filter(
            BotFluxo.empresa_id == empresa_id,
            BotFluxo.id != fluxo_id
        ).update({"ativo": False})

    fluxo.ativo = dados.ativo
    db.commit()
    db.refresh(fluxo)

    return fluxo


# ==================== NÓS ====================

@router.post("/fluxos/{fluxo_id}/nos", response_model=BotFluxoNoResponse, status_code=status.HTTP_201_CREATED)
async def criar_no(
    fluxo_id: int,
    no: BotFluxoNoCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Cria um novo nó no fluxo"""
    # Verificar se fluxo existe e pertence à empresa
    fluxo = db.query(BotFluxo).filter(
        BotFluxo.id == fluxo_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not fluxo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fluxo não encontrado"
        )

    # Criar nó
    opcoes_data = no.opcoes
    no_dict = no.model_dump(exclude={"opcoes"})

    novo_no = BotFluxoNo(
        fluxo_id=fluxo_id,
        **no_dict
    )

    db.add(novo_no)
    db.flush()  # Para obter o ID do nó

    # Criar opções
    for opcao_data in opcoes_data:
        nova_opcao = BotFluxoOpcao(
            no_id=novo_no.id,
            **opcao_data.model_dump()
        )
        db.add(nova_opcao)

    db.commit()
    db.refresh(novo_no)

    return novo_no


@router.patch("/nos/{no_id}", response_model=BotFluxoNoResponse)
async def atualizar_no(
    no_id: int,
    dados: BotFluxoNoUpdate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Atualiza um nó"""
    # Verificar se nó existe e pertence à empresa
    no = db.query(BotFluxoNo).join(BotFluxo).filter(
        BotFluxoNo.id == no_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not no:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nó não encontrado"
        )

    # Atualizar campos
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(no, campo, valor)

    db.commit()
    db.refresh(no)

    return no


@router.delete("/nos/{no_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_no(
    no_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Deleta um nó"""
    no = db.query(BotFluxoNo).join(BotFluxo).filter(
        BotFluxoNo.id == no_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not no:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nó não encontrado"
        )

    db.delete(no)
    db.commit()


# ==================== OPÇÕES ====================

@router.post("/nos/{no_id}/opcoes", response_model=BotFluxoOpcaoResponse, status_code=status.HTTP_201_CREATED)
async def criar_opcao(
    no_id: int,
    opcao: BotFluxoOpcaoCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Cria uma nova opção (item de lista ou botão)"""
    # Verificar se nó existe e pertence à empresa
    no = db.query(BotFluxoNo).join(BotFluxo).filter(
        BotFluxoNo.id == no_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not no:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nó não encontrado"
        )

    nova_opcao = BotFluxoOpcao(
        no_id=no_id,
        **opcao.model_dump()
    )

    db.add(nova_opcao)
    db.commit()
    db.refresh(nova_opcao)

    return nova_opcao


@router.patch("/opcoes/{opcao_id}", response_model=BotFluxoOpcaoResponse)
async def atualizar_opcao(
    opcao_id: int,
    dados: BotFluxoOpcaoUpdate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Atualiza uma opção"""
    opcao = db.query(BotFluxoOpcao).join(
        BotFluxoNo, BotFluxoOpcao.no_id == BotFluxoNo.id
    ).join(BotFluxo).filter(
        BotFluxoOpcao.id == opcao_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not opcao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opção não encontrada"
        )

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(opcao, campo, valor)

    db.commit()
    db.refresh(opcao)

    return opcao


@router.delete("/opcoes/{opcao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_opcao(
    opcao_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """Deleta uma opção"""
    opcao = db.query(BotFluxoOpcao).join(
        BotFluxoNo, BotFluxoOpcao.no_id == BotFluxoNo.id
    ).join(BotFluxo).filter(
        BotFluxoOpcao.id == opcao_id,
        BotFluxo.empresa_id == empresa_id
    ).first()

    if not opcao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opção não encontrada"
        )

    db.delete(opcao)
    db.commit()


# ==================== UPLOAD DE IMAGEM ====================

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/upload-imagem")
async def upload_imagem_bot(
    empresa_id: CurrentEmpresa,
    file: UploadFile = File(...),
):
    """Upload de imagem para uso nos nós do Bot Builder."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF."
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo muito grande. Máximo 5MB."
        )

    # Gerar nome único
    ext = Path(file.filename).suffix if file.filename else ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"

    upload_dir = Path("uploads/bot-builder")
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / filename
    file_path.write_bytes(content)

    return {"url": f"/uploads/bot-builder/{filename}", "filename": filename}
