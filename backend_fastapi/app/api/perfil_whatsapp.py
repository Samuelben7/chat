from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database.database import get_db
from app.models.models import Empresa
from app.services.whatsapp import WhatsAppService
from app.core.dependencies import CurrentEmpresa

router = APIRouter()

# Categorias suportadas pela Meta (vertical)
CATEGORIAS_WHATSAPP = [
    {"value": "AUTOMOTIVE", "label": "Automotivo"},
    {"value": "BEAUTY_SPA_AND_SALON", "label": "Beleza, Spa e Salão"},
    {"value": "CLOTHING_AND_APPAREL", "label": "Vestuário e Moda"},
    {"value": "EDUCATION", "label": "Educação"},
    {"value": "ENTERTAINMENT", "label": "Entretenimento"},
    {"value": "EVENT_PLANNING_AND_SERVICE", "label": "Eventos e Serviços"},
    {"value": "FINANCE_AND_BANKING", "label": "Finanças e Bancário"},
    {"value": "FOOD_AND_GROCERY", "label": "Alimentação e Mercearia"},
    {"value": "PUBLIC_SERVICE", "label": "Serviço Público"},
    {"value": "HOTEL_AND_LODGING", "label": "Hotel e Hospedagem"},
    {"value": "MEDICAL_AND_HEALTH", "label": "Saúde e Medicina"},
    {"value": "NON_PROFIT", "label": "ONG / Sem fins lucrativos"},
    {"value": "OTHER", "label": "Outro"},
    {"value": "PROFESSIONAL_SERVICES", "label": "Serviços Profissionais"},
    {"value": "SHOPPING_AND_RETAIL", "label": "Varejo / Comércio"},
    {"value": "TRAVEL_AND_TRANSPORTATION", "label": "Viagem e Transporte"},
    {"value": "RESTAURANT", "label": "Restaurante"},
    {"value": "NOT_A_BIZ", "label": "Uso pessoal"},
]


class PerfilUpdate(BaseModel):
    about: Optional[str] = None          # Texto "Sobre" (máx 139 chars)
    address: Optional[str] = None        # Endereço
    description: Optional[str] = None   # Descrição do negócio (máx 256 chars)
    email: Optional[str] = None          # E-mail de contato
    vertical: Optional[str] = None       # Categoria (ex: "CLOTHING_AND_APPAREL")
    websites: Optional[List[str]] = None # Lista de sites (máx 2)


def _get_empresa(empresa_id: int, db: Session) -> Empresa:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id, Empresa.ativa == True).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if not empresa.phone_number_id or not empresa.whatsapp_token:
        raise HTTPException(status_code=400, detail="WhatsApp não configurado. Configure o número primeiro.")
    return empresa


@router.get("/perfil-whatsapp")
async def obter_perfil(empresa_id: CurrentEmpresa, db: Session = Depends(get_db)):
    """Retorna o perfil atual do WhatsApp Business."""
    empresa = _get_empresa(empresa_id, db)
    svc = WhatsAppService(empresa)
    try:
        perfil = await svc.get_business_profile()
        return {
            "success": True,
            "perfil": perfil,
            "categorias": CATEGORIAS_WHATSAPP,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar perfil: {str(e)}")


@router.patch("/perfil-whatsapp")
async def atualizar_perfil(dados: PerfilUpdate, empresa_id: CurrentEmpresa, db: Session = Depends(get_db)):
    """Atualiza campos do perfil WhatsApp Business."""
    empresa = _get_empresa(empresa_id, db)
    svc = WhatsAppService(empresa)

    # Montar apenas campos preenchidos
    campos = {}
    if dados.about is not None:
        campos["about"] = dados.about[:139]  # Meta limita a 139 chars
    if dados.address is not None:
        campos["address"] = dados.address
    if dados.description is not None:
        campos["description"] = dados.description[:256]
    if dados.email is not None:
        campos["email"] = dados.email
    if dados.vertical is not None:
        campos["vertical"] = dados.vertical
    if dados.websites is not None:
        campos["websites"] = dados.websites[:2]  # Meta aceita no máximo 2

    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")

    try:
        ok = await svc.update_business_profile(campos)
        return {"success": ok, "campos_atualizados": list(campos.keys())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar perfil: {str(e)}")


@router.post("/perfil-whatsapp/foto")
async def atualizar_foto(
    file: UploadFile = File(...),
    empresa_id: CurrentEmpresa = None,
    db: Session = Depends(get_db),
):
    """
    Faz upload da foto de perfil do WhatsApp Business.
    Aceita JPEG ou PNG (recomendado: quadrado 640x640px, máx 5MB).
    """
    empresa = _get_empresa(empresa_id, db)

    # Validar tipo
    mime = file.content_type or "image/jpeg"
    if mime not in ("image/jpeg", "image/png", "image/jpg"):
        raise HTTPException(status_code=400, detail="Apenas JPEG e PNG são aceitos para foto de perfil.")

    image_bytes = await file.read()
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Foto muito grande. Máximo 5MB.")

    svc = WhatsAppService(empresa)
    try:
        handle = await svc.upload_profile_photo(image_bytes, mime)
        ok = await svc.update_business_profile({"profile_picture_handle": handle})
        return {"success": ok, "handle": handle}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar foto: {str(e)}")
