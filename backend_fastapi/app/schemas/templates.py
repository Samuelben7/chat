from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ==================== COMPONENTS ====================

class TemplateButton(BaseModel):
    type: str  # QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE
    text: str
    url: Optional[str] = None
    phone_number: Optional[str] = None
    example: Optional[List[str]] = None


class TemplateComponent(BaseModel):
    type: str  # HEADER, BODY, FOOTER, BUTTONS
    format: Optional[str] = None  # TEXT, IMAGE, VIDEO, DOCUMENT (for HEADER)
    text: Optional[str] = None
    buttons: Optional[List[TemplateButton]] = None
    example: Optional[Dict[str, Any]] = None
    limited_time_offer: Optional[Dict[str, Any]] = None


# ==================== CREATE / UPDATE ====================

class TemplateCreate(BaseModel):
    name: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', max_length=512)
    category: str = Field(..., pattern=r'^(MARKETING|UTILITY|AUTHENTICATION)$')
    language: str = Field(default='pt_BR', max_length=10)
    components: List[TemplateComponent]
    parameter_format: Optional[str] = None


class TemplateUpdate(BaseModel):
    components: List[TemplateComponent]
    category: Optional[str] = None


# ==================== RESPONSE ====================

class TemplateResponse(BaseModel):
    id: int
    empresa_id: int
    meta_template_id: Optional[str] = None
    name: str
    category: str
    language: str
    status: str
    components: Any
    parameter_format: Optional[str] = None
    quality_score: Optional[str] = None
    rejected_reason: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class TemplateListResponse(BaseModel):
    templates: List[TemplateResponse]
    total: int
    page: int
    per_page: int


# ==================== SEND ====================

class TemplateSend(BaseModel):
    whatsapp_number: str
    template_name: Optional[str] = None
    template_id: Optional[int] = None
    language: str = 'pt_BR'
    components: Optional[List[Dict[str, Any]]] = None
    parameter_values: Optional[Dict[str, str]] = None
    media_url: Optional[str] = None


class TemplateSendBulk(BaseModel):
    template_id: int
    language: str = 'pt_BR'
    components: Optional[List[Dict[str, Any]]] = None
    parameter_values: Optional[Dict[str, str]] = None
    media_url: Optional[str] = None
    whatsapp_numbers: Optional[List[str]] = None
    lista_id: Optional[int] = None


class TemplateSendResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    whatsapp_number: str
    error: Optional[str] = None


class TemplateBulkSendResponse(BaseModel):
    total: int
    enviados: int
    erros: int
    resultados: List[TemplateSendResponse]


# ==================== SYNC ====================

class TemplateSyncResponse(BaseModel):
    criados: int
    atualizados: int
    removidos: int
    total: int


# ==================== CHECK STATUS ====================

class TemplateStatusCheckResponse(BaseModel):
    id: int
    meta_template_id: Optional[str] = None
    status: str
    quality_score: Optional[str] = None
    rejected_reason: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== CONTACT NAME ====================

class ContactNameResponse(BaseModel):
    nome: Optional[str] = None


# ==================== MEDIA UPLOAD ====================

class MediaUploadResponse(BaseModel):
    url: str
    filename: str
