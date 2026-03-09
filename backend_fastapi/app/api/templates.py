"""
Endpoints para gerenciamento de Templates de Mensagem WhatsApp
"""

# ─── Mapa de erros da Meta API → Mensagens em Português ──────────────────────
_META_ERROS_PT = {
    "2388040": "Campo do template excedeu o limite de caracteres permitido.",
    "2388047": "O cabeçalho da mensagem contém formatação inválida.",
    "2388072": "O corpo da mensagem contém formatação inválida.",
    "2388073": "O rodapé da mensagem contém formatação inválida.",
    "2388293": "O template tem variáveis demais para seu tamanho. Reduza as variáveis ou aumente o texto.",
    "2388299": "Variáveis não podem ficar no início nem no fim do template.",
    "2388019": "Limite de templates atingido para esta conta WhatsApp Business.",
    "200005": "Métricas de template ainda não estão disponíveis para esta conta.",
    "200006": "Não é possível desativar métricas de template após habilitadas.",
    "200007": "Métricas de template não foram habilitadas para esta conta.",
    "100": "Parâmetro inválido — a mensagem deve ser do tipo template.",
    "131009": "Um ou mais valores de parâmetro são inválidos.",
    "131055": "Apenas mensagens de template de marketing são suportadas.",
    "134100": "Apenas templates de marketing são permitidos nesta API.",
    "134101": "Seu template ainda está sincronizando (pode levar até 10 min). Aguarde e tente novamente.",
    "134102": "Template indisponível. Verifique seu status de elegibilidade ou contate o suporte Meta.",
    "132018": "Erro de validação do template. Verifique os parâmetros e tente novamente.",
    "1752041": "Requisição duplicada — este cliente já foi convidado por outro parceiro.",
}


def _traduzir_erro_meta(error: Exception) -> str:
    """Traduz erros da Meta API para português."""
    error_str = str(error)
    for code, msg in _META_ERROS_PT.items():
        if code in error_str:
            return msg
    return f"Erro da Meta API: {error_str}"


from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional
from pathlib import Path
import uuid
import re
import os
import logging

from datetime import datetime, timezone, timedelta
from app.database.database import get_db
from app.models.models import Empresa, MessageTemplate, ListaContatosMembro, Cliente, MensagemLog
from app.core.dependencies import CurrentEmpresa
from app.services.template_service import TemplateService
from app.schemas.templates import (
    TemplateCreate, TemplateUpdate, TemplateResponse, TemplateListResponse,
    TemplateSend, TemplateSendBulk, TemplateSendResponse, TemplateBulkSendResponse,
    TemplateSyncResponse, TemplateStatusCheckResponse, ContactNameResponse,
    MediaUploadResponse,
)

logger = logging.getLogger("templates_api")

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

    # Converter components para dict
    components_dict = [c.model_dump(exclude_none=True) for c in dados.components]

    # ---- Carrossel interativo: salvar localmente sem enviar à Meta ----
    if dados.category.upper() == "INTERACTIVE_CAROUSEL":
        template = MessageTemplate(
            empresa_id=empresa_id,
            meta_template_id=None,
            waba_id=empresa.waba_id if empresa.waba_id else None,
            name=dados.name,
            category=dados.category.upper(),
            language=dados.language,
            status="SAVED",
            components=components_dict,
            parameter_format=dados.parameter_format,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template

    service = _get_template_service(empresa)

    try:
        result = await service.create_template(
            name=dados.name,
            category=dados.category,
            language=dados.language,
            components=components_dict,
            parameter_format=dados.parameter_format,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=_traduzir_erro_meta(e))

    # Detectar image path do header (se houver)
    header_image_path = None
    for comp in components_dict:
        if comp.get("type", "").upper() == "HEADER":
            fmt = comp.get("format", "").upper()
            if fmt in ("IMAGE", "VIDEO"):
                example = comp.get("example", {})
                handle = example.get("header_handle", [])
                # Se tem URL local salva no upload
                if isinstance(handle, list) and handle:
                    # Tentar encontrar imagem local correspondente
                    pass
                # Verificar se tem url local no example
                local_url = comp.get("_local_url")
                if local_url:
                    header_image_path = local_url

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
        header_image_path=header_image_path,
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

    components_dict = [c.model_dump(exclude_none=True) for c in dados.components]

    # ---- CARROSSEL: editar apenas localmente, sem Meta API ----
    if template.category.upper() == "INTERACTIVE_CAROUSEL":
        template.components = components_dict
        if dados.category:
            template.category = dados.category
        db.commit()
        db.refresh(template)
        return template

    # ---- TEMPLATE PADRÃO: editar via Meta API ----
    if not template.meta_template_id:
        raise HTTPException(status_code=400, detail="Template sem ID da Meta para edição")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    try:
        await service.edit_template(
            meta_template_id=template.meta_template_id,
            components=components_dict,
            category=dados.category,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=_traduzir_erro_meta(e))

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

    # ---- CARROSSEL: deletar apenas localmente, sem Meta API ----
    is_carousel = template.category.upper() == "INTERACTIVE_CAROUSEL"

    if not is_carousel:
        empresa = _get_empresa(empresa_id, db)
        service = _get_template_service(empresa)
        try:
            await service.delete_template(name=template.name)
        except Exception as e:
            raise HTTPException(status_code=400, detail=_traduzir_erro_meta(e))

    # Limpar imagem de header associada
    if template.header_image_path:
        try:
            image_file = Path(template.header_image_path.lstrip("/"))
            if image_file.exists():
                image_file.unlink()
                logger.info(f"Imagem removida: {image_file}")
        except Exception as e:
            logger.warning(f"Erro ao remover imagem {template.header_image_path}: {e}")

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

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    # ---- CARROSSEL INTERATIVO (salvo localmente, não precisa APPROVED) ----
    if template.category.upper() == "INTERACTIVE_CAROUSEL":
        # Extrair cards do componente CAROUSEL
        carousel_comp = None
        body_comp = None
        for comp in (template.components or []):
            t = comp.get("type", "").upper()
            if t == "CAROUSEL":
                carousel_comp = comp
            elif t == "BODY":
                body_comp = comp

        if not carousel_comp:
            return TemplateSendResponse(
                success=False,
                whatsapp_number=dados.whatsapp_number,
                error="Componente CAROUSEL não encontrado no template"
            )

        example = carousel_comp.get("example", {})
        cards = example.get("cards", [])

        # Body text: lê do componente BODY (não do CAROUSEL)
        body_text = (body_comp.get("text", "") if body_comp else "") or ""
        if not body_text and dados.parameter_values:
            body_text = dados.parameter_values.get("body", "")

        from app.core.config import settings
        public_base = settings.PUBLIC_BASE_URL.rstrip("/")

        try:
            message_id = await service.send_carousel_message(
                to=dados.whatsapp_number,
                body_text=body_text or "Confira nossas opções:",
                cards=cards,
                public_base_url=public_base,
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

    # ---- TEMPLATE PADRÃO (precisa APPROVED) ----
    if template.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Template não aprovado (status: {template.status})")

    # Build components from parameter_values or media_url (auto-build)
    from app.core.config import settings as _settings
    send_components = dados.components
    if template.components:
        send_components = TemplateService.build_send_components(
            template_components=template.components,
            parameter_values=dados.parameter_values or {},
            media_url=dados.media_url,
            header_image_path=template.header_image_path,
            public_base_url=_settings.PUBLIC_BASE_URL,
        )

    try:
        message_id = await service.send_template_message(
            to=dados.whatsapp_number,
            template_name=template.name,
            language_code=dados.language,
            components=send_components,
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

    is_carousel = template.category.upper() == "INTERACTIVE_CAROUSEL"

    if not is_carousel and template.status != "APPROVED":
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

    # Language: usar do template como fallback
    language_code = dados.language or template.language or "pt_BR"

    # Detectar parâmetros do template body
    body_params = []
    has_body_params = False
    for comp in (template.components or []):
        if comp.get("type", "").upper() == "BODY":
            body_params = re.findall(r'\{\{(\d+)\}\}', comp.get("text", ""))
            has_body_params = len(body_params) > 0
            break

    # Para listas grandes (>50), usar Celery task
    if len(numbers) > 50:
        try:
            from app.tasks.tasks import enviar_template_massa_task
            task = enviar_template_massa_task.delay(
                empresa_id=empresa_id,
                template_id=dados.template_id,
                numbers=numbers,
                language_code=language_code,
                parameter_values=dados.parameter_values or {},
                media_url=dados.media_url,
                use_contact_name=dados.use_contact_name,
                fallback_name=dados.fallback_name,
                coupon_code=dados.coupon_code,
            )
            return TemplateBulkSendResponse(
                total=len(numbers),
                enviados=0,
                erros=0,
                resultados=[],
                task_id=task.id,
            )
        except ImportError:
            logger.warning("Celery task não disponível, processando sincronamente")

    # ---- CAROUSEL BULK SEND ----
    if is_carousel:
        carousel_comp = None
        body_comp_c = None
        for comp in (template.components or []):
            t = comp.get("type", "").upper()
            if t == "CAROUSEL":
                carousel_comp = comp
            elif t == "BODY":
                body_comp_c = comp

        if not carousel_comp:
            raise HTTPException(status_code=400, detail="Componente CAROUSEL não encontrado no template")

        example = carousel_comp.get("example", {})
        cards = example.get("cards", [])
        # Body text: lê do componente BODY (não do CAROUSEL)
        body_text = (body_comp_c.get("text", "") if body_comp_c else "") or "Confira nossas opções:"

        from app.core.config import settings as _settings
        _public_base = _settings.PUBLIC_BASE_URL.rstrip("/")

        resultados = []
        enviados = 0
        erros = 0

        for number in numbers:
            try:
                message_id = await service.send_carousel_message(
                    to=number,
                    body_text=body_text,
                    cards=cards,
                    public_base_url=_public_base,
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
            resultados=resultados,
        )

    # Processamento síncrono para listas pequenas (<=50)
    resultados = []
    enviados = 0
    erros = 0

    for number in numbers:
        try:
            # Construir parameter_values personalizado por contato
            pv = dict(dados.parameter_values or {})

            if dados.use_contact_name and has_body_params and "1" not in pv:
                contact_name = _get_contact_name_for_number(db, empresa_id, number)
                pv["1"] = contact_name or dados.fallback_name

            if dados.coupon_code and "coupon_code" not in pv:
                pv["coupon_code"] = dados.coupon_code

            # Build components personalizados para este contato
            from app.core.config import settings as _settings
            send_components = dados.components
            if template.components:
                send_components = TemplateService.build_send_components(
                    template_components=template.components,
                    parameter_values=pv,
                    media_url=dados.media_url,
                    header_image_path=template.header_image_path,
                    public_base_url=_settings.PUBLIC_BASE_URL,
                )

            message_id = await service.send_template_message(
                to=number,
                template_name=template.name,
                language_code=language_code,
                components=send_components,
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
        resultados=resultados,
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

    # Limpar imagens de templates que ficaram DELETED
    deleted_templates = db.query(MessageTemplate).filter(
        MessageTemplate.empresa_id == empresa_id,
        MessageTemplate.status == "DELETED",
        MessageTemplate.header_image_path.isnot(None),
    ).all()
    for tmpl in deleted_templates:
        try:
            image_file = Path(tmpl.header_image_path.lstrip("/"))
            if image_file.exists():
                image_file.unlink()
                logger.info(f"Imagem de template DELETED removida: {image_file}")
            tmpl.header_image_path = None
        except Exception as e:
            logger.warning(f"Erro ao limpar imagem de template deletado: {e}")
    if deleted_templates:
        db.commit()

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


# ========== CHECK STATUS ==========

@router.get("/templates/{template_id}/check-status", response_model=TemplateStatusCheckResponse)
async def check_template_status(
    template_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Verifica status atualizado de um template na Meta API."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.empresa_id == empresa_id
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    if not template.meta_template_id:
        raise HTTPException(status_code=400, detail="Template sem ID da Meta")

    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    try:
        result = await service.check_template_status(template.meta_template_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao consultar Meta API: {str(e)}")

    # Atualizar registro local
    template.status = result.get("status", template.status)
    qs = result.get("quality_score")
    if isinstance(qs, dict):
        template.quality_score = qs.get("score")
    elif qs:
        template.quality_score = str(qs)
    template.rejected_reason = result.get("rejected_reason", template.rejected_reason)

    db.commit()
    db.refresh(template)

    return template


def _get_contact_name_for_number(db: Session, empresa_id: int, number: str) -> Optional[str]:
    """Busca primeiro nome do contato (Cliente → MensagemLog → None)."""
    # 1. Tabela Cliente
    cliente = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.whatsapp_number == number,
    ).first()
    if cliente and cliente.nome_completo:
        return cliente.nome_completo.split()[0]

    # 2. MensagemLog (profile.name do webhook)
    msg = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.whatsapp_number == number,
        MensagemLog.direcao == "recebida",
    ).order_by(MensagemLog.timestamp.desc()).first()

    if msg and msg.dados_extras:
        extras = msg.dados_extras if isinstance(msg.dados_extras, dict) else {}
        profile_name = (
            extras.get("profile", {}).get("name")
            if isinstance(extras.get("profile"), dict)
            else extras.get("profile_name")
        )
        if profile_name:
            return profile_name.split()[0]

    return None


# ========== CONTACT NAME ===========

@router.get("/templates/contact-name", response_model=ContactNameResponse)
async def get_contact_name(
    number: str = Query(..., description="Número WhatsApp do contato"),
    empresa_id: CurrentEmpresa = None,
    db: Session = Depends(get_db),
):
    """
    Busca nome do contato com fallback em 3 níveis:
    1. Tabela Cliente (nome_completo)
    2. MensagemLog (profile.name do webhook em dados_extras)
    3. Retorna null
    """
    # Nível 1: Buscar no Cliente
    cliente = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.whatsapp_number == number
    ).first()

    if cliente and cliente.nome_completo:
        nome = cliente.nome_completo.split()[0] if cliente.nome_completo else None
        return ContactNameResponse(nome=nome)

    # Nível 2: Buscar no MensagemLog (profile.name do webhook)
    msg = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.whatsapp_number == number,
        MensagemLog.direcao == 'recebida'
    ).order_by(MensagemLog.timestamp.desc()).first()

    if msg and msg.dados_extras:
        profile_name = None
        extras = msg.dados_extras if isinstance(msg.dados_extras, dict) else {}
        profile_name = extras.get("profile", {}).get("name") if isinstance(extras.get("profile"), dict) else extras.get("profile_name")
        if profile_name:
            return ContactNameResponse(nome=profile_name.split()[0])

    # Nível 3: Não encontrado
    return ContactNameResponse(nome=None)


# ========== UPLOAD MEDIA ==========

@router.post("/templates/upload-media", response_model=MediaUploadResponse)
async def upload_template_media(
    file: UploadFile = File(...),
    empresa_id: CurrentEmpresa = None,
    db: Session = Depends(get_db),
):
    """Upload de mídia para header de template.
    Imagens são automaticamente convertidas para JPEG (compatível com WhatsApp).
    Salva localmente para preview E faz upload via Meta Resumable Upload API.
    """
    image_types = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"}
    allowed_types = image_types | {"video/mp4", "video/3gpp", "application/pdf"}

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não suportado: {file.content_type}. Use imagens (JPEG, PNG, WebP), vídeo (MP4) ou PDF."
        )

    # Max 16MB
    contents = await file.read()
    if len(contents) > 16 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Arquivo muito grande (máximo 16MB)")

    upload_dir = Path("uploads/templates")
    upload_dir.mkdir(parents=True, exist_ok=True)

    final_mime = file.content_type or "application/octet-stream"

    # Converter imagens para JPEG (WhatsApp template headers só aceitam JPEG/PNG)
    if file.content_type in image_types and file.content_type not in ("image/jpeg", "image/jpg", "image/png"):
        try:
            import io
            from PIL import Image as PILImage
            img = PILImage.open(io.BytesIO(contents)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=92)
            contents = buf.getvalue()
            final_mime = "image/jpeg"
            logger.info(f"Imagem convertida de {file.content_type} para JPEG")
        except Exception as e:
            logger.warning(f"Conversão de imagem falhou, usando original: {e}")

    # Determinar extensão baseada no tipo final
    if final_mime in ("image/jpeg", "image/jpg"):
        ext = ".jpg"
    elif final_mime == "image/png":
        ext = ".png"
    else:
        ext = Path(file.filename or "file").suffix

    filename = f"template_{empresa_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = upload_dir / filename

    with open(file_path, "wb") as f:
        f.write(contents)

    local_url = f"/uploads/templates/{filename}"

    # Upload para Meta Resumable Upload API → header_handle
    header_handle = None
    try:
        empresa = _get_empresa(empresa_id, db)
        service = _get_template_service(empresa)
        header_handle = await service.upload_media_to_meta(
            file_data=contents,
            file_name=filename,
            file_type=final_mime,
        )
    except Exception as e:
        logging.getLogger("template_upload").warning(
            f"Meta upload failed (local file saved): {e}"
        )

    return MediaUploadResponse(
        url=local_url,
        filename=filename,
        header_handle=header_handle,
    )


# ========== ASSOCIATE IMAGE TO TEMPLATE ==========

@router.patch("/templates/{template_id}/set-image")
async def set_template_image(
    template_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
    image_path: str = Query(..., description="Path local da imagem"),
):
    """Associa uma imagem de header a um template existente."""
    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.empresa_id == empresa_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    template.header_image_path = image_path
    db.commit()
    return {"detail": "Imagem associada com sucesso"}


# ========== CATALOG (Meta Commerce) ==========

@router.get("/catalog")
async def listar_produtos_catalogo(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
    catalog_id: Optional[str] = Query(None, description="ID do catálogo (se não informado, busca automaticamente do WABA)"),
    limit: int = Query(30, ge=1, le=100),
):
    """
    Lista produtos do catálogo Meta vinculado ao WABA.
    Se catalog_id não for informado, busca automaticamente via commerce_settings do WABA.
    Requer permissão catalog_management no app Meta.
    """
    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    # Buscar catalog_id automaticamente se não foi passado
    resolved_catalog_id = catalog_id
    if not resolved_catalog_id:
        try:
            resolved_catalog_id = await service.get_waba_catalog_id()
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Não foi possível detectar o catálogo vinculado ao WABA: {str(e)}"
            )

    if not resolved_catalog_id:
        raise HTTPException(
            status_code=404,
            detail="Nenhum catálogo vinculado ao WABA. Vincule um catálogo no WhatsApp Manager ou informe o catalog_id manualmente."
        )

    try:
        result = await service.list_catalog_products(resolved_catalog_id, limit=limit)
        return {
            "catalog_id": resolved_catalog_id,
            "products": result.get("data", []),
            "paging": result.get("paging", {}),
            "total": len(result.get("data", [])),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao buscar produtos: {str(e)}")


@router.get("/catalog/detect")
async def detectar_catalogo(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Detecta o catalog_id vinculado ao WABA da empresa."""
    empresa = _get_empresa(empresa_id, db)
    service = _get_template_service(empresa)

    try:
        catalog_id = await service.get_waba_catalog_id()
        if catalog_id:
            return {"catalog_id": catalog_id, "vinculado": True}
        return {"catalog_id": None, "vinculado": False}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao detectar catálogo: {str(e)}")
