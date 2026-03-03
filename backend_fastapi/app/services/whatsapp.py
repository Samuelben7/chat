import httpx
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models.models import Empresa
from app.core.config import settings


class WhatsAppService:
    """Serviço para interagir com a WhatsApp Business Cloud API (multi-tenant)."""

    def __init__(self, empresa: Empresa):
        """
        Inicializa o serviço com credenciais específicas da empresa.

        Args:
            empresa: Objeto Empresa contendo as credenciais WhatsApp
        """
        self.empresa = empresa
        self.base_url = f"https://graph.facebook.com/v25.0/{empresa.phone_number_id}"
        
        # Prioriza o token da plataforma (Tech Provider) se disponível.
        # Se não, usa o token específico da empresa (fallback).
        token = settings.META_PLATFORM_TOKEN or empresa.whatsapp_token

        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    @classmethod
    def from_phone_number_id(cls, db: Session, phone_number_id: str) -> Optional["WhatsAppService"]:
        """
        Cria instância do serviço buscando empresa pelo phone_number_id.

        Args:
            db: Sessão do banco de dados
            phone_number_id: ID do número de telefone WhatsApp

        Returns:
            WhatsAppService ou None se empresa não encontrada
        """
        empresa = db.query(Empresa).filter(
            Empresa.phone_number_id == phone_number_id,
            Empresa.ativa == True
        ).first()

        if not empresa:
            return None

        return cls(empresa)

    async def send_text_message(self, to: str, text: str, context_message_id: Optional[str] = None) -> str:
        """
        Envia mensagem de texto simples.
        Se context_message_id for informado, envia como resposta contextual (quote).

        Args:
            to: Número de WhatsApp do destinatário
            text: Texto da mensagem
            context_message_id: WAMID da mensagem que está sendo respondida (opcional)

        Returns:
            message_id: ID da mensagem enviada
        """
        payload: Dict = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": text}
        }
        if context_message_id:
            payload["context"] = {"message_id": context_message_id}

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]

    async def send_button_message(
        self,
        to: str,
        body_text: str,
        buttons: List[Dict[str, str]],
        header: Optional[str] = None,
        footer: Optional[str] = None,
        header_image_url: Optional[str] = None
    ) -> str:
        """
        Envia mensagem com botões interativos (máximo 3 botões).

        Args:
            to: Número de WhatsApp do destinatário
            body_text: Texto principal da mensagem
            buttons: Lista de botões [{"id": "btn_1", "title": "Texto"}]
            header: Texto opcional do cabeçalho
            footer: Texto opcional do rodapé
            header_image_url: URL de imagem para o header (prioridade sobre texto)

        Returns:
            message_id: ID da mensagem enviada
        """
        if len(buttons) > 3:
            buttons = buttons[:3]

        interactive_buttons = []
        for btn in buttons:
            interactive_buttons.append({
                "type": "reply",
                "reply": {
                    "id": btn["id"],
                    "title": btn["title"][:20]  # Máximo 20 caracteres
                }
            })

        interactive = {
            "type": "button",
            "body": {"text": body_text},
            "action": {"buttons": interactive_buttons}
        }

        # Header: imagem tem prioridade sobre texto
        if header_image_url:
            interactive["header"] = {"type": "image", "image": {"link": header_image_url}}
        elif header:
            interactive["header"] = {"type": "text", "text": header}
        if footer:
            interactive["footer"] = {"text": footer}

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]

    async def send_list_message(
        self,
        to: str,
        body_text: str,
        button_text: str,
        sections: List[Dict],
        header: Optional[str] = None,
        footer: Optional[str] = None
    ) -> str:
        """
        Envia mensagem com lista interativa.

        Args:
            to: Número de WhatsApp do destinatário
            body_text: Texto principal da mensagem
            button_text: Texto do botão para abrir lista
            sections: Lista de seções [{"title": "Seção", "rows": [{"id": "1", "title": "Item"}]}]
            header: Texto opcional do cabeçalho
            footer: Texto opcional do rodapé

        Returns:
            message_id: ID da mensagem enviada
        """
        interactive = {
            "type": "list",
            "body": {"text": body_text},
            "action": {
                "button": button_text,
                "sections": sections
            }
        }

        if header:
            interactive["header"] = {"type": "text", "text": header}
        if footer:
            interactive["footer"] = {"text": footer}

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]

    async def send_image_message(
        self,
        to: str,
        image_url: str,
        caption: Optional[str] = None
    ) -> str:
        """
        Envia mensagem com imagem.

        Args:
            to: Numero de WhatsApp do destinatario
            image_url: URL publica da imagem
            caption: Legenda opcional da imagem

        Returns:
            message_id: ID da mensagem enviada
        """
        image_data = {"link": image_url}
        if caption:
            image_data["caption"] = caption

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "image",
            "image": image_data
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]

    async def get_media_url(self, media_id: str) -> Dict:
        """
        Obtém URL temporária de download para um media_id da Meta.

        Returns:
            dict com: url, mime_type, file_size, id
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://graph.facebook.com/v21.0/{media_id}",
                headers={"Authorization": f"Bearer {self.empresa.whatsapp_token}"},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def upload_media(self, file_bytes: bytes, mime_type: str, file_name: str) -> str:
        """
        Faz upload de mídia para a Meta e retorna o media_id.

        Args:
            file_bytes: Bytes do arquivo em memória (sem salvar em disco)
            mime_type: MIME type do arquivo
            file_name: Nome do arquivo

        Returns:
            media_id: ID da mídia na Meta
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/media",
                headers={"Authorization": f"Bearer {self.empresa.whatsapp_token}"},
                files={"file": (file_name, file_bytes, mime_type)},
                data={"messaging_product": "whatsapp", "type": mime_type},
                timeout=60.0
            )
            if not response.is_success:
                print(f"❌ Meta upload error {response.status_code}: {response.text}")
            response.raise_for_status()
            return response.json()["id"]

    async def send_typing_indicator(self, message_id: str) -> bool:
        """
        Envia indicador de digitação para o usuário no WhatsApp.
        Simultaneamente marca a mensagem como lida (conforme doc oficial).
        O indicador é automaticamente removido após 25 segundos ou quando responder.

        Args:
            message_id: WAMID da mensagem recebida do usuário

        Returns:
            success: True se enviado com sucesso
        """
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
            "typing_indicator": {"type": "text"},
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/messages",
                    headers=self.headers,
                    json=payload,
                    timeout=10.0
                )
                return response.json().get("success", False)
        except Exception:
            return False

    async def mark_as_read(self, message_id: str) -> bool:
        """
        Marca mensagem como lida (sem typing indicator).

        Args:
            message_id: ID da mensagem a marcar como lida

        Returns:
            success: True se marcado com sucesso
        """
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()

            return response.json().get("success", False)

    async def send_media_message(
        self,
        to: str,
        media_type: str,
        media_id: str,
        caption: Optional[str] = None,
        filename: Optional[str] = None,
        context_message_id: Optional[str] = None,
    ) -> str:
        """
        Envia mensagem de mídia (image, audio, document, video) usando media_id.
        Se context_message_id for informado, envia como resposta contextual.

        Args:
            to: Número de WhatsApp do destinatário
            media_type: Tipo da mídia (image, audio, document, video)
            media_id: ID da mídia obtido via upload_media
            caption: Legenda opcional (para image, video, document)
            filename: Nome do arquivo (apenas para document)

        Returns:
            message_id: ID da mensagem enviada
        """
        media_data: Dict = {"id": media_id}
        if caption and media_type in ("image", "video", "document"):
            media_data["caption"] = caption
        if filename and media_type == "document":
            media_data["filename"] = filename

        payload: Dict = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": media_type,
            media_type: media_data
        }
        if context_message_id:
            payload["context"] = {"message_id": context_message_id}

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()["messages"][0]["id"]

    async def send_template_message(
        self,
        to: str,
        template_name: str,
        language_code: str = "pt_BR",
        components: Optional[List[Dict]] = None
    ) -> str:
        """
        Envia mensagem template (necessário para iniciar conversas após 24h).

        Args:
            to: Número de WhatsApp do destinatário
            template_name: Nome do template aprovado
            language_code: Código do idioma (padrão pt_BR)
            components: Componentes do template (parâmetros dinâmicos)

        Returns:
            message_id: ID da mensagem enviada
        """
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
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            if not response.is_success:
                print(f"❌ Erro ao enviar template '{template_name}' para {to}: {response.status_code} - {response.text}")
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]

    async def get_business_profile(self) -> dict:
        """Busca o perfil do WhatsApp Business (nome, foto, categoria, etc.)."""
        fields = "about,address,description,email,profile_picture_url,vertical,websites"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/whatsapp_business_profile",
                params={"fields": fields},
                headers=self.headers,
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            # A API retorna {"data": [...]}
            profiles = data.get("data", [])
            return profiles[0] if profiles else {}

    async def update_business_profile(self, campos: dict) -> bool:
        """
        Atualiza campos do perfil WhatsApp Business.
        Campos aceitos: about, address, description, email, vertical, websites, profile_picture_handle
        """
        # Meta rejeita strings vazias — filtrar campos com valor vazio
        campos_limpos = {
            k: v for k, v in campos.items()
            if v is not None and v != "" and v != []
        }
        if not campos_limpos:
            return True  # Nada para atualizar

        payload = {"messaging_product": "whatsapp", **campos_limpos}
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/whatsapp_business_profile",
                json=payload,
                headers=self.headers,
                timeout=15.0,
            )
            if not response.is_success:
                # Inclui body da Meta no erro para facilitar debug
                try:
                    meta_error = response.json()
                    detail = meta_error.get("error", {}).get("message", response.text)
                except Exception:
                    detail = response.text
                raise Exception(f"Meta API {response.status_code}: {detail}")
            return response.json().get("success", False)

    async def upload_profile_photo(self, image_bytes: bytes, mime_type: str) -> str:
        """
        Faz upload da foto de perfil para a Meta e retorna o handle.
        O handle é usado em update_business_profile(profile_picture_handle=handle).
        """
        import io
        # Upload via multipart form para o endpoint de mídia
        form_data = {
            "messaging_product": (None, "whatsapp"),
            "type": (None, mime_type),
            "file": ("profile.jpg", io.BytesIO(image_bytes), mime_type),
        }
        headers_upload = {"Authorization": f"Bearer {self.empresa.whatsapp_token}"}
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/media",
                files=form_data,
                headers=headers_upload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            # Meta retorna "h" como handle da foto de perfil
            handle = data.get("h") or data.get("id")
            if not handle:
                raise RuntimeError(f"Meta não retornou handle da foto: {data}")
            return handle


def extract_message_data(webhook_data: Dict) -> Optional[Dict]:
    """
    Extrai dados relevantes da mensagem recebida via webhook.

    Returns:
        Dict com: from_number, message_id, message_type, message_content, timestamp, phone_number_id
    """
    try:
        entry = webhook_data.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})

        # Extrai phone_number_id para identificar a empresa
        phone_number_id = value.get("metadata", {}).get("phone_number_id")

        if "messages" not in value:
            return None

        message = value["messages"][0]

        data = {
            "from_number": message.get("from"),
            "message_id": message.get("id"),
            "timestamp": message.get("timestamp"),
            "message_type": message.get("type"),
            "message_content": None,
            "interactive_response": None,
            "phone_number_id": phone_number_id  # Importante para multi-tenant
        }

        # Extrai conteúdo baseado no tipo
        if data["message_type"] == "text":
            data["message_content"] = message.get("text", {}).get("body")

        elif data["message_type"] == "interactive":
            interactive = message.get("interactive", {})
            if interactive.get("type") == "button_reply":
                data["interactive_response"] = {
                    "type": "button",
                    "id": interactive.get("button_reply", {}).get("id"),
                    "title": interactive.get("button_reply", {}).get("title")
                }
                data["message_content"] = data["interactive_response"]["id"]

            elif interactive.get("type") == "list_reply":
                data["interactive_response"] = {
                    "type": "list",
                    "id": interactive.get("list_reply", {}).get("id"),
                    "title": interactive.get("list_reply", {}).get("title"),
                    "description": interactive.get("list_reply", {}).get("description")
                }
                data["message_content"] = data["interactive_response"]["id"]

        return data

    except (KeyError, IndexError) as e:
        return None
