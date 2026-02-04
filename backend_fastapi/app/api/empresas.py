"""
Endpoints para gerenciamento de Empresas (multi-tenant).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database.database import get_db
from app.models.models import Empresa, ConfiguracaoBot, TipoServico, VagaAgenda
from app.schemas.schemas import (
    EmpresaCreate,
    EmpresaUpdate,
    EmpresaResponse,
    EmpresaComCredenciais,
    ConfiguracaoBotCreate,
    ConfiguracaoBotUpdate,
    ConfiguracaoBotResponse,
)

router = APIRouter()


# ==================== EMPRESAS ====================

@router.post("/", response_model=EmpresaResponse, status_code=status.HTTP_201_CREATED)
async def criar_empresa(empresa: EmpresaCreate, db: Session = Depends(get_db)):
    """Cria uma nova empresa no sistema."""
    # Verifica se phone_number_id já existe
    if db.query(Empresa).filter(Empresa.phone_number_id == empresa.phone_number_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone Number ID já cadastrado"
        )

    db_empresa = Empresa(**empresa.dict())
    db.add(db_empresa)
    db.commit()
    db.refresh(db_empresa)

    return db_empresa


@router.get("/", response_model=List[EmpresaResponse])
async def listar_empresas(
    skip: int = 0,
    limit: int = 100,
    ativa: bool = None,
    db: Session = Depends(get_db)
):
    """Lista todas as empresas."""
    query = db.query(Empresa)

    if ativa is not None:
        query = query.filter(Empresa.ativa == ativa)

    empresas = query.offset(skip).limit(limit).all()
    return empresas


@router.get("/{empresa_id}", response_model=EmpresaComCredenciais)
async def obter_empresa(empresa_id: int, db: Session = Depends(get_db)):
    """Obtém uma empresa específica com credenciais completas."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    return empresa


@router.patch("/{empresa_id}", response_model=EmpresaResponse)
async def atualizar_empresa(
    empresa_id: int,
    empresa_update: EmpresaUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza dados de uma empresa."""
    db_empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()

    if not db_empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    # Atualiza apenas campos fornecidos
    update_data = empresa_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_empresa, field, value)

    db.commit()
    db.refresh(db_empresa)

    return db_empresa


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_empresa(empresa_id: int, db: Session = Depends(get_db)):
    """Deleta uma empresa (desativa ao invés de deletar)."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    # Desativa ao invés de deletar
    empresa.ativa = False
    db.commit()


# ==================== CONFIGURAÇÕES DO BOT ====================

@router.get("/{empresa_id}/configuracoes", response_model=List[ConfiguracaoBotResponse])
async def listar_configuracoes_bot(empresa_id: int, db: Session = Depends(get_db)):
    """Lista todas as configurações do bot de uma empresa."""
    # Verifica se empresa existe
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    configs = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id
    ).all()

    return configs


@router.post("/{empresa_id}/configuracoes", response_model=ConfiguracaoBotResponse, status_code=status.HTTP_201_CREATED)
async def criar_configuracao_bot(
    empresa_id: int,
    config: ConfiguracaoBotCreate,
    db: Session = Depends(get_db)
):
    """Cria uma nova configuração do bot."""
    # Verifica se empresa existe
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    # Verifica se chave já existe
    if db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == config.chave
    ).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chave de configuração já existe"
        )

    db_config = ConfiguracaoBot(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)

    return db_config


@router.get("/{empresa_id}/configuracoes/{chave}", response_model=ConfiguracaoBotResponse)
async def obter_configuracao_bot(empresa_id: int, chave: str, db: Session = Depends(get_db)):
    """Obtém uma configuração específica."""
    config = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == chave
    ).first()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuração não encontrada"
        )

    return config


@router.patch("/{empresa_id}/configuracoes/{chave}", response_model=ConfiguracaoBotResponse)
async def atualizar_configuracao_bot(
    empresa_id: int,
    chave: str,
    config_update: ConfiguracaoBotUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza uma configuração do bot."""
    config = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == chave
    ).first()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuração não encontrada"
        )

    # Atualiza apenas campos fornecidos
    update_data = config_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)

    return config


@router.delete("/{empresa_id}/configuracoes/{chave}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_configuracao_bot(empresa_id: int, chave: str, db: Session = Depends(get_db)):
    """Deleta uma configuração do bot."""
    config = db.query(ConfiguracaoBot).filter(
        ConfiguracaoBot.empresa_id == empresa_id,
        ConfiguracaoBot.chave == chave
    ).first()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuração não encontrada"
        )

    db.delete(config)
    db.commit()


# ==================== ESTATÍSTICAS ====================

@router.get("/{empresa_id}/estatisticas")
async def obter_estatisticas_empresa(empresa_id: int, db: Session = Depends(get_db)):
    """Obtém estatísticas gerais da empresa."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não encontrada"
        )

    # Conta clientes
    from app.models.models import Cliente, Contratacao, Atendimento, MensagemLog

    total_clientes = db.query(Cliente).filter(Cliente.empresa_id == empresa_id).count()

    total_contratacoes = db.query(Contratacao).join(Cliente).filter(
        Cliente.empresa_id == empresa_id
    ).count()

    total_atendimentos = db.query(Atendimento).join(
        MensagemLog,
        MensagemLog.whatsapp_number == Atendimento.whatsapp_number
    ).filter(
        MensagemLog.empresa_id == empresa_id
    ).distinct().count()

    total_mensagens = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id
    ).count()

    return {
        "empresa_id": empresa_id,
        "nome": empresa.nome,
        "total_clientes": total_clientes,
        "total_contratacoes": total_contratacoes,
        "total_atendimentos": total_atendimentos,
        "total_mensagens": total_mensagens,
    }
