"""
Endpoints para gerenciamento de Templates de Mensagem WhatsApp
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database.database import get_db
from app.models.models import Empresa, MessageTemplate, ListaContatosMembro
from app.core.dependencies import CurrentEmpresa
from app.services.template_service import TemplateService
from app.schemas.templates import (
    TemplateCreate, TemplateUpdate, TemplateResponse, TemplateListResponse,
    TemplateSend, TemplateSendBulk, TemplateSendResponse, TemplateBulkSendResponse,
    TemplateSyncResponse,
)

router = APIRouter()


def _get_empresa(empresa_id: int, db: Session) -> Empresa:
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.ativa == True
    ).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return empresa


def _get_template_service(empresa: Empresa) -> TemplateService:
    return TemplateService(empresa)


# ========== LIST ==========

@router.get("/templates", response_model=TemplateListResponse)
async def listar_templates(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
):
    """Lista templates do banco local (filtrado, paginado)."""
    query = db.query(MessageTemplate).filter(
        MessageTemplate.empresa_id == empresa_id
    )

    if status:
        query = query.filter(MessageTemplate.status == status.upper())
    if category:
        query = query.filter(MessageTemplate.category == category.upper())
    if search:
        query = query.filter(MessageTemplate.name.ilike(f"%{search}%"))

    total = query.count()
    templates = query.order_by(MessageTemplate.atualizado_em.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page).all()

    return TemplateListResponse(
        templates=[TemplateResponse.model_validate(t) for t in templates],
        total=total,
        page=page,
        per_page=per_page
    )


# ========== CREATE ==========

@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def criar_template(
    dados: TemplateCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Cria template via Meta API e salva localmente."""
    empresa = _get_empresa(empresa_id, db)

    if not empresa.waba_id:
        raise HTTPException(
            status_code=400,
            detail="waba_id não configurado. Atualize as configurações da empresa."
        )

    service = _get_template_service(empresa)

    # Converter components para dict
    components_dict = [c.model_dump(exclude_none=True) for c in dados.components]

    try:
        result = await service.create_template(
            name=dados.name,
            category=dados.category,
            language=dados.language,
            components=components_dict,
            parameter_format=dados.parameter_format,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro na Meta API: {str(e)}")

    # Salvar localmente
    template = MessageTemplate(
        empresa_id=empresa_id,
        meta_template_id=result.get("id"),
        waba_id=empresa.waba_id,
        name=dados.name,
        category=dados.category,
        language=dados.language,
        status=result.get("status", "PENDING"),
        components=components_dict,
        parameter_format=dados.parameter_format,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return template


# ========== UPDATE ==========

@router.patch("/templates/{template_id}", response_model=TemplateResponse)
async def editar_template(
    template_id: int,
    dados: TemplateUpdate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Edita template via Meta API e atualiza localmente."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.empresa_id == empresa_id
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    if not template.meta_template_id:
        raise HTTPException(status_code=400, detail="Template sem ID da Meta para edição")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    components_dict = [c.model_dump(exclude_none=True) for c in dados.components]

    try:
        await service.edit_template(
            meta_template_id=template.meta_template_id,
            components=components_dict,
            category=dados.category,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro na Meta API: {str(e)}")

    template.components = components_dict
    if dados.category:
        template.category = dados.category
    template.status = "PENDING"  # Volta para revisão após edição

    db.commit()
    db.refresh(template)

    return template


# ========== DELETE ==========

@router.delete("/templates/{template_id}")
async def deletar_template(
    template_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Deleta template via Meta API e remove localmente."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.empresa_id == empresa_id
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    try:
        await service.delete_template(name=template.name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro na Meta API: {str(e)}")

    db.delete(template)
    db.commit()

    return {"detail": "Template deletado com sucesso"}


# ========== SEND ==========

@router.post("/templates/{template_id}/send", response_model=TemplateSendResponse)
async def enviar_template(
    template_id: int,
    dados: TemplateSend,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Envia template para um contato."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.empresa_id == empresa_id
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    if template.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Template não aprovado (status: {template.status})")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    try:
        message_id = await service.send_template_message(
            to=dados.whatsapp_number,
            template_name=template.name,
            language_code=dados.language,
            components=dados.components,
        )
        service.log_template_send(db, dados.whatsapp_number, template.name, message_id)
        return TemplateSendResponse(
            success=True,
            message_id=message_id,
            whatsapp_number=dados.whatsapp_number
        )
    except Exception as e:
        return TemplateSendResponse(
            success=False,
            whatsapp_number=dados.whatsapp_number,
            error=str(e)
        )


# ========== SEND BULK ==========

@router.post("/templates/send-bulk", response_model=TemplateBulkSendResponse)
async def enviar_template_massa(
    dados: TemplateSendBulk,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Envia template para múltiplos contatos ou lista."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == dados.template_id,
        MessageTemplate.empresa_id == empresa_id
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    if template.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Template não aprovado (status: {template.status})")

    # Coletar números
    numbers = list(dados.whatsapp_numbers or [])

    if dados.lista_id:
        membros = db.query(ListaContatosMembro).filter(
            ListaContatosMembro.lista_id == dados.lista_id
        ).all()
        for m in membros:
            if m.whatsapp_number not in numbers:
                numbers.append(m.whatsapp_number)

    if not numbers:
        raise HTTPException(status_code=400, detail="Nenhum número para enviar")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    resultados = []
    enviados = 0
    erros = 0

    for number in numbers:
        try:
            message_id = await service.send_template_message(
                to=number,
                template_name=template.name,
                language_code=dados.language,
                components=dados.components,
            )
            service.log_template_send(db, number, template.name, message_id)
            resultados.append(TemplateSendResponse(
                success=True, message_id=message_id, whatsapp_number=number
            ))
            enviados += 1
        except Exception as e:
            resultados.append(TemplateSendResponse(
                success=False, whatsapp_number=number, error=str(e)
            ))
            erros += 1

    return TemplateBulkSendResponse(
        total=len(numbers),
        enviados=enviados,
        erros=erros,
        resultados=resultados
    )


# ========== SYNC ==========

@router.post("/templates/sync", response_model=TemplateSyncResponse)
async def sincronizar_templates(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Sincroniza templates da Meta API com o banco local."""
    empresa = _get_empresa(empresa_id, db)

    if not empresa.waba_id:
        raise HTTPException(
            status_code=400,
            detail="waba_id não configurado. Atualize as configurações da empresa."
        )

    service = _get_template_service(empresa)

    try:
        criados, atualizados, removidos = await service.sync_templates(db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao sincronizar: {str(e)}")

    total = db.query(MessageTemplate).filter(
        MessageTemplate.empresa_id == empresa_id,
        MessageTemplate.status != 'DELETED'
    ).count()

    return TemplateSyncResponse(
        criados=criados,
        atualizados=atualizados,
        removidos=removidos,
        total=total
    )
