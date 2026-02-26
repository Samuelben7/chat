import os
import re
import httpx
import logging
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.models import Empresa, MessageTemplate, MensagemLog
from datetime import datetime

logger = logging.getLogger("template_service")


class TemplateService:
    """Serviço para gerenciar templates do WhatsApp Business API."""

    GRAPH_API_VERSION = "v25.0"
    BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

    def __init__(self, empresa: Empresa):
        self.empresa = empresa
        self.waba_id = empresa.waba_id
        self.phone_number_id = empresa.phone_number_id
        self.token = empresa.whatsapp_token
        self.headers = {
            "Authorization": f"Bearer {empresa.whatsapp_token}",
            "Content-Type": "application/json"
        }

    async def upload_media_to_meta(self, file_data: bytes, file_name: str,
                                    file_type: str) -> str:
        """
        Upload media via Meta Resumable Upload API.
        Returns the header_handle string for use in template creation.

        Steps:
        1. POST /{APP_ID}/uploads → creates upload session → returns session id
        2. POST /{session_id} → uploads file bytes → returns handle (h)
        """
        app_id = os.getenv("META_APP_ID")
        if not app_id:
            raise ValueError(
                "META_APP_ID não configurado. Adicione META_APP_ID no .env "
                "(encontre em Meta Developer Dashboard > App Settings > Basic)"
            )

        # Step 1: Create upload session
        async with httpx.AsyncClient() as client:
            session_resp = await client.post(
                f"{self.BASE_URL}/{app_id}/uploads",
                headers={
                    "Authorization": f"Bearer {self.token}",
                },
                json={
                    "file_length": len(file_data),
                    "file_name": file_name,
                    "file_type": file_type,
                },
                timeout=30.0
            )
            if session_resp.status_code >= 400:
                try:
                    err = session_resp.json().get("error", {})
                    raise ValueError(
                        f"Upload session error [{err.get('code')}]: {err.get('message')}"
                    )
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"Upload session failed: {session_resp.text}")

            session_data = session_resp.json()
            upload_session_id = session_data.get("id")
            if not upload_session_id:
                raise ValueError(f"Upload session sem ID: {session_data}")

            logger.info(f"Upload session created: {upload_session_id}")

            # Step 2: Upload file bytes
            upload_resp = await client.post(
                f"{self.BASE_URL}/{upload_session_id}",
                headers={
                    "Authorization": f"OAuth {self.token}",
                    "file_offset": "0",
                    "Content-Type": file_type,
                },
                content=file_data,
                timeout=60.0
            )
            if upload_resp.status_code >= 400:
                try:
                    err = upload_resp.json().get("error", {})
                    raise ValueError(
                        f"File upload error [{err.get('code')}]: {err.get('message')}"
                    )
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"File upload failed: {upload_resp.text}")

            upload_data = upload_resp.json()
            handle = upload_data.get("h")
            if not handle:
                raise ValueError(f"Upload sem handle: {upload_data}")

            logger.info(f"Media uploaded, handle: {handle[:30]}...")
            return handle

    async def create_template(self, name: str, category: str, language: str,
                              components: List[Dict],
                              parameter_format: Optional[str] = None) -> Dict:
        """Cria template via Meta API."""
        if not self.waba_id:
            raise ValueError("waba_id não configurado para esta empresa")

        # Clean components before sending to Meta API (per official docs)
        clean_components = []
        for comp in components:
            c = dict(comp)
            comp_type = c.get("type", "").upper()
            # Ensure component type is uppercase
            c["type"] = comp_type

            # HEADER handling
            if comp_type == "HEADER":
                fmt = c.get("format", "TEXT").upper()
                c["format"] = fmt

                if fmt in ("IMAGE", "VIDEO", "DOCUMENT"):
                    # Media headers: require header_handle from Meta upload
                    c.pop("text", None)
                    if "example" in c:
                        handle = c["example"].get("header_handle", [])
                        if not handle or any("example.com" in str(h) for h in handle):
                            del c["example"]
                    if "example" not in c:
                        raise ValueError(
                            f"Header de {fmt} requer upload de mídia. "
                            "Faça upload da imagem/vídeo/documento antes de criar o template."
                        )

                elif fmt == "TEXT":
                    # Text headers: ensure header_text example for params
                    text = c.get("text", "")
                    header_params = re.findall(r'\{\{(\d+)\}\}', text)
                    if header_params and "example" not in c:
                        # Auto-generate example values
                        c["example"] = {
                            "header_text": [f"exemplo_{p}" for p in header_params]
                        }
                    elif "example" in c:
                        # Ensure header_text is a list
                        ht = c["example"].get("header_text")
                        if ht and not isinstance(ht, list):
                            c["example"]["header_text"] = [ht]

            # BODY handling: ensure body_text example format
            elif comp_type == "BODY":
                if "example" in c:
                    bt = c["example"].get("body_text")
                    if bt is not None:
                        # Must be array of arrays: [["val1", "val2"]]
                        if isinstance(bt, list) and len(bt) > 0:
                            if not isinstance(bt[0], list):
                                # Wrap flat list in outer list
                                c["example"]["body_text"] = [bt]
                        elif isinstance(bt, str):
                            c["example"]["body_text"] = [[bt]]

            # BUTTONS: fix button structures per Meta API spec
            elif comp_type == "BUTTONS" and "buttons" in c:
                fixed_buttons = []
                for btn in c["buttons"]:
                    btn = dict(btn)
                    btn_type = btn.get("type", "").upper()

                    if btn_type == "COPY_CODE":
                        # COPY_CODE: only "type" + "example" (string, no "text")
                        example_val = btn.get("example", btn.get("text", "CODE123"))
                        # Ensure example is a string, not a list
                        if isinstance(example_val, list):
                            example_val = example_val[0] if example_val else "CODE123"
                        fixed_buttons.append({
                            "type": "COPY_CODE",
                            "example": str(example_val),
                        })
                    elif btn_type == "URL":
                        # URL: "type" + "text" + "url" (+ optional "example" list)
                        url_btn: Dict = {
                            "type": "URL",
                            "text": btn.get("text", "Link"),
                            "url": btn.get("url", ""),
                        }
                        if btn.get("example"):
                            ex = btn["example"]
                            # Must be list of strings
                            url_btn["example"] = ex if isinstance(ex, list) else [ex]
                        fixed_buttons.append(url_btn)
                    elif btn_type == "PHONE_NUMBER":
                        # PHONE_NUMBER: "type" + "text" + "phone_number"
                        fixed_buttons.append({
                            "type": "PHONE_NUMBER",
                            "text": btn.get("text", "Call"),
                            "phone_number": btn.get("phone_number", ""),
                        })
                    elif btn_type == "QUICK_REPLY":
                        # QUICK_REPLY: "type" + "text"
                        fixed_buttons.append({
                            "type": "QUICK_REPLY",
                            "text": btn.get("text", ""),
                        })
                    else:
                        fixed_buttons.append(btn)
                c["buttons"] = fixed_buttons

            clean_components.append(c)

        payload = {
            "name": name,
            "category": category,
            "language": language,
            "components": clean_components,
        }
        if parameter_format:
            payload["parameter_format"] = parameter_format

        import json as _json
        import logging
        logger = logging.getLogger("template_service")
        logger.warning(f"[META API] Sending payload: {_json.dumps(payload, ensure_ascii=False, indent=2)}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{self.waba_id}/message_templates",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            if response.status_code >= 400:
                # Return the actual Meta API error message with full details
                try:
                    error_data = response.json()
                    logger.warning(f"[META API] Error response: {_json.dumps(error_data, ensure_ascii=False, indent=2)}")
                    err = error_data.get("error", {})
                    error_code = err.get("code", "")
                    error_subcode = err.get("error_subcode", "")
                    error_msg = err.get("message", response.text)
                    error_user_title = err.get("error_user_title", "")
                    error_user_msg = err.get("error_user_msg", "")
                    # Build detailed message
                    detail = f"[{error_code}"
                    if error_subcode:
                        detail += f"/{error_subcode}"
                    detail += f"] {error_msg}"
                    if error_user_title:
                        detail += f" | {error_user_title}"
                    if error_user_msg:
                        detail += f": {error_user_msg}"
                    raise ValueError(detail)
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"HTTP {response.status_code}: {response.text}")
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
            if response.status_code >= 400:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", response.text)
                    error_code = error_data.get("error", {}).get("code", "")
                    raise ValueError(f"[{error_code}] {error_msg}")
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"HTTP {response.status_code}: {response.text}")
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
        # Normalizar número: garantir que começa com +
        if to and not to.startswith("+"):
            to = f"+{to}"

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

        logger.warning(f"📤 Template payload: {payload}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{self.phone_number_id}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            logger.warning(f"📤 Meta response: {response.status_code} {response.text}")
            response.raise_for_status()
            data = response.json()
            return data["messages"][0]["id"]

    async def send_carousel_message(self, to: str, body_text: str,
                                    cards: List[Dict]) -> str:
        """
        Envia mensagem interativa de carrossel (tipo 'interactive/carousel').
        Usado para templates INTERACTIVE_CAROUSEL salvos localmente.

        Cada card deve ter a estrutura:
        {
            "card_index": int,
            "header_type": "image" | "video",
            "header_url": str,          # URL pública da mídia
            "body_text": str,           # opcional
            "button_type": "url" | "quick_reply",
            "button_display_text": str, # para URL
            "button_url": str,          # para URL
            "quick_replies": [{"id": str, "title": str}]  # para quick_reply
        }
        """
        if to and not to.startswith("+"):
            to = f"+{to}"

        # Montar cards no formato da Meta API
        api_cards = []
        for card in cards:
            card_index = card.get("card_index", 0)
            header_type = card.get("header_type", "image")
            header_url = card.get("header_url", "")
            body_text_card = card.get("body_text", "")
            button_type = card.get("button_type", "url")

            api_card: Dict = {
                "card_index": card_index,
                "type": "cta_url",  # Sempre "cta_url" per Meta API docs, independente do tipo de botão
                "header": {
                    "type": header_type,
                    header_type: {"link": header_url},
                },
            }

            if body_text_card:
                api_card["body"] = {"text": body_text_card}

            if button_type == "url":
                api_card["action"] = {
                    "name": "cta_url",
                    "parameters": {
                        "display_text": card.get("button_display_text", "Saiba mais"),
                        "url": card.get("button_url", ""),
                    },
                }
            else:
                # Quick reply — aceita múltiplos botões
                qrs = card.get("quick_replies", [])
                api_card["action"] = {
                    "buttons": [
                        {
                            "type": "quick_reply",
                            "quick_reply": {
                                "id": qr.get("id", f"btn_{i}"),
                                "title": qr.get("title", "Responder"),
                            },
                        }
                        for i, qr in enumerate(qrs)
                    ]
                }

            api_cards.append(api_card)

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "carousel",
                "body": {"text": body_text},
                "action": {"cards": api_cards},
            },
        }

        logger.warning(f"📤 Carousel payload: {payload}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/{self.phone_number_id}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            logger.warning(f"📤 Meta carousel response: {response.status_code} {response.text}")
            if response.status_code >= 400:
                try:
                    err = response.json().get("error", {})
                    raise ValueError(f"[{err.get('code')}] {err.get('message', response.text)}")
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"HTTP {response.status_code}: {response.text}")
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

        # Map de templates existentes no banco (excluindo carrosseis locais — eles não existem na Meta)
        existing = db.query(MessageTemplate).filter(
            MessageTemplate.empresa_id == self.empresa.id
        ).all()
        # Carrosseis são gerenciados localmente: nunca tocar neles no sync
        existing_map = {
            (t.name, t.language): t
            for t in existing
            if t.category.upper() != "INTERACTIVE_CAROUSEL"
        }
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

        # Remove templates que não existem mais na Meta (carrosseis são ignorados — são locais)
        for key, tmpl in existing_map.items():
            if key not in meta_keys and tmpl.status != 'DELETED':
                tmpl.status = 'DELETED'
                removidos += 1

        db.commit()
        return criados, atualizados, removidos

    async def check_template_status(self, meta_template_id: str) -> Dict:
        """Busca status atualizado de um template individual na Meta API."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{meta_template_id}",
                headers=self.headers,
                params={"fields": "status,quality_score,rejected_reason"},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def build_send_components(
        template_components: List[Dict],
        parameter_values: Optional[Dict[str, str]] = None,
        media_url: Optional[str] = None,
    ) -> List[Dict]:
        """
        Monta os components para envio baseado nos parâmetros do template.
        Converte parameter_values (dict de posição→valor) em formato Meta API.
        """
        send_components = []

        for comp in template_components:
            comp_type = comp.get("type", "")

            # Header com mídia
            if comp_type == "HEADER":
                fmt = comp.get("format", "TEXT")
                if fmt in ("IMAGE", "VIDEO", "DOCUMENT") and media_url:
                    media_type = fmt.lower()
                    if media_type == "document":
                        send_components.append({
                            "type": "header",
                            "parameters": [{"type": media_type, media_type: {"link": media_url}}]
                        })
                    else:
                        send_components.append({
                            "type": "header",
                            "parameters": [{"type": media_type, media_type: {"link": media_url}}]
                        })
                elif fmt == "TEXT" and parameter_values:
                    # Check for header params like {{1}}
                    text = comp.get("text", "")
                    params_in_header = re.findall(r'\{\{(\d+)\}\}', text)
                    if params_in_header:
                        header_params = []
                        for p in params_in_header:
                            val = parameter_values.get(f"header_{p}", parameter_values.get(p, ""))
                            header_params.append({"type": "text", "text": val})
                        send_components.append({"type": "header", "parameters": header_params})

            # Body com parâmetros
            elif comp_type == "BODY" and parameter_values:
                text = comp.get("text", "")
                params_in_body = re.findall(r'\{\{(\d+)\}\}', text)
                if params_in_body:
                    body_params = []
                    for p in params_in_body:
                        val = parameter_values.get(p, parameter_values.get(f"body_{p}", ""))
                        body_params.append({"type": "text", "text": val})
                    send_components.append({"type": "body", "parameters": body_params})

            # Buttons - COPY_CODE precisa de parâmetro coupon_code
            elif comp_type == "BUTTONS":
                buttons = comp.get("buttons", [])
                for idx, btn in enumerate(buttons):
                    if btn.get("type") == "COPY_CODE" and parameter_values:
                        code = parameter_values.get("coupon_code", parameter_values.get("copy_code", ""))
                        if code:
                            send_components.append({
                                "type": "button",
                                "sub_type": "copy_code",
                                "index": str(idx),
                                "parameters": [{"type": "coupon_code", "coupon_code": code}]
                            })
                    elif btn.get("type") == "URL" and parameter_values:
                        url_suffix = parameter_values.get(f"url_{idx}", "")
                        if url_suffix:
                            send_components.append({
                                "type": "button",
                                "sub_type": "url",
                                "index": str(idx),
                                "parameters": [{"type": "text", "text": url_suffix}]
                            })

        return send_components

    def log_template_send(self, db: Session, to: str, template_name: str,
                          message_id: str, error: Optional[str] = None):
        """Registra envio de template no MensagemLog."""
        log = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=to.lstrip('+'),  # sempre sem '+' para consistência
            message_id=message_id,
            direcao='enviada',
            tipo_mensagem='template',
            conteudo=f"[Template: {template_name}]",
            dados_extras={"template_name": template_name},
            erro=error
        )
        db.add(log)
        db.commit()

    async def get_waba_catalog_id(self) -> Optional[str]:
        """
        Busca o catalog_id vinculado ao número de telefone/WABA.
        Tenta primeiro via phone_number_id (whatsapp_commerce_settings),
        depois via WABA (commerce_settings) como fallback.
        Retorna None se não houver catálogo vinculado.
        """
        async with httpx.AsyncClient() as client:
            # Tentativa 1: via phone_number_id → whatsapp_commerce_settings
            if self.phone_number_id:
                try:
                    resp = await client.get(
                        f"{self.BASE_URL}/{self.phone_number_id}/whatsapp_commerce_settings",
                        headers=self.headers,
                        timeout=30.0
                    )
                    if resp.status_code < 400:
                        data = resp.json()
                        items = data.get("data", [])
                        if items and isinstance(items, list):
                            catalog_id = items[0].get("catalog_id")
                            if catalog_id:
                                logger.info(f"catalog_id encontrado via phone_number: {catalog_id}")
                                return catalog_id
                except Exception as e:
                    logger.warning(f"Falha ao buscar catalog via phone_number_id: {e}")

            # Tentativa 2: via WABA → commerce_settings
            if not self.waba_id:
                raise ValueError("waba_id não configurado para esta empresa")

            resp2 = await client.get(
                f"{self.BASE_URL}/{self.waba_id}",
                headers=self.headers,
                params={"fields": "commerce_settings"},
                timeout=30.0
            )
            if resp2.status_code >= 400:
                return None
            data2 = resp2.json()
            commerce = data2.get("commerce_settings", {})
            catalog_id = commerce.get("catalog_id")
            if catalog_id:
                logger.info(f"catalog_id encontrado via WABA commerce_settings: {catalog_id}")
            return catalog_id

    async def list_catalog_products(self, catalog_id: str, limit: int = 30) -> Dict:
        """
        Lista produtos de um catálogo Meta via Graph API.
        Retorna dict com 'data' (lista de produtos) e 'paging'.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{catalog_id}/products",
                headers=self.headers,
                params={
                    "fields": "id,name,description,price,currency,image_url,retailer_id,availability,condition",
                    "limit": limit,
                },
                timeout=30.0
            )
            if response.status_code >= 400:
                try:
                    err = response.json().get("error", {})
                    raise ValueError(f"[{err.get('code')}] {err.get('message', response.text)}")
                except ValueError:
                    raise
                except Exception:
                    raise ValueError(f"HTTP {response.status_code}: {response.text}")
            return response.json()
