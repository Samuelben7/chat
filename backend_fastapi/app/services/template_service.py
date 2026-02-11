import httpx
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.models import Empresa, MessageTemplate, MensagemLog
from datetime import datetime


class TemplateService:
    """Serviço para gerenciar templates do WhatsApp Business API."""

    GRAPH_API_VERSION = "v21.0"
    BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

    def __init__(self, empresa: Empresa):
        self.empresa = empresa
        self.waba_id = empresa.waba_id
        self.phone_number_id = empresa.phone_number_id
        self.headers = {
            "Authorization": f"Bearer {empresa.whatsapp_token}",
            "Content-Type": "application/json"
        }

    async def create_template(self, name: str, category: str, language: str,
                              components: List[Dict],
                              parameter_format: Optional[str] = None) -> Dict:
        """Cria template via Meta API."""
        if not self.waba_id:
            raise ValueError("waba_id não configurado para esta empresa")

        payload = {
            "name": name,
            "category": category,
            "language": language,
            "components": components,
        }
        if parameter_format:
            payload["parameter_format"] = parameter_format

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{self.waba_id}/message_templates",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def list_templates_from_meta(self, limit: int = 100,
                                       after: Optional[str] = None) -> Dict:
        """Lista templates da Meta API (paginado)."""
        if not self.waba_id:
            raise ValueError("waba_id não configurado para esta empresa")

        params = {"limit": limit}
        if after:
            params["after"] = after

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{self.waba_id}/message_templates",
                headers=self.headers,
                params=params,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def edit_template(self, meta_template_id: str,
                            components: List[Dict],
                            category: Optional[str] = None) -> Dict:
        """Edita template via Meta API."""
        payload = {"components": components}
        if category:
            payload["category"] = category

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{meta_template_id}",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def delete_template(self, name: str) -> Dict:
        """Deleta template via Meta API."""
        if not self.waba_id:
            raise ValueError("waba_id não configurado para esta empresa")

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.BASE_URL}/{self.waba_id}/message_templates",
                headers=self.headers,
                params={"name": name},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def send_template_message(self, to: str, template_name: str,
                                     language_code: str = "pt_BR",
                                     components: Optional[List[Dict]] = None) -> str:
        """Envia mensagem de template para um contato."""
        template = {
            "name": template_name,
            "language": {"code": language_code}
        }
        if components:
            template["components"] = components

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "template",
            "template": template
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{self.phone_number_id}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data["messages"][0]["id"]

    async def sync_templates(self, db: Session) -> Tuple[int, int, int]:
        """
        Sincroniza templates da Meta API com o banco local.
        Returns: (criados, atualizados, removidos)
        """
        criados = 0
        atualizados = 0
        removidos = 0

        # Buscar todos da Meta API
        meta_templates = []
        after = None
        while True:
            result = await self.list_templates_from_meta(limit=100, after=after)
            meta_templates.extend(result.get("data", []))
            paging = result.get("paging", {})
            cursors = paging.get("cursors", {})
            after = cursors.get("after")
            if not after or "next" not in paging:
                break

        # Map de templates existentes no banco
        existing = db.query(MessageTemplate).filter(
            MessageTemplate.empresa_id == self.empresa.id
        ).all()
        existing_map = {(t.name, t.language): t for t in existing}
        meta_keys = set()

        for mt in meta_templates:
            name = mt.get("name", "")
            language = mt.get("language", "pt_BR")
            key = (name, language)
            meta_keys.add(key)

            if key in existing_map:
                # Update
                tmpl = existing_map[key]
                tmpl.meta_template_id = mt.get("id")
                tmpl.status = mt.get("status", "PENDING")
                tmpl.category = mt.get("category", tmpl.category)
                tmpl.components = mt.get("components", [])
                tmpl.quality_score = mt.get("quality_score", {}).get("score") if isinstance(mt.get("quality_score"), dict) else mt.get("quality_score")
                tmpl.rejected_reason = mt.get("rejected_reason")
                tmpl.parameter_format = mt.get("parameter_format")
                atualizados += 1
            else:
                # Create
                new_tmpl = MessageTemplate(
                    empresa_id=self.empresa.id,
                    meta_template_id=mt.get("id"),
                    waba_id=self.waba_id,
                    name=name,
                    category=mt.get("category", "UTILITY"),
                    language=language,
                    status=mt.get("status", "PENDING"),
                    components=mt.get("components", []),
                    parameter_format=mt.get("parameter_format"),
                    quality_score=mt.get("quality_score", {}).get("score") if isinstance(mt.get("quality_score"), dict) else mt.get("quality_score"),
                    rejected_reason=mt.get("rejected_reason"),
                )
                db.add(new_tmpl)
                criados += 1

        # Remove templates que não existem mais na Meta
        for key, tmpl in existing_map.items():
            if key not in meta_keys and tmpl.status != 'DELETED':
                tmpl.status = 'DELETED'
                removidos += 1

        db.commit()
        return criados, atualizados, removidos

    def log_template_send(self, db: Session, to: str, template_name: str,
                          message_id: str, error: Optional[str] = None):
        """Registra envio de template no MensagemLog."""
        log = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=to,
            message_id=message_id,
            direcao='enviada',
            tipo_mensagem='template',
            conteudo=f"[Template: {template_name}]",
            dados_extras={"template_name": template_name},
            erro=error
        )
        db.add(log)
        db.commit()
