import httpx
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models.models import Empresa


class WhatsAppService:
    """Serviço para interagir com a WhatsApp Business Cloud API (multi-tenant)."""

    def __init__(self, empresa: Empresa):
        """
        Inicializa o serviço com credenciais específicas da empresa.

        Args:
            empresa: Objeto Empresa contendo as credenciais WhatsApp
        """
        self.empresa = empresa
        self.base_url = f"https://graph.facebook.com/v21.0/{empresa.phone_number_id}"
        self.headers = {
            "Authorization": f"Bearer {empresa.whatsapp_token}",
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

    async def send_text_message(self, to: str, text: str) -> str:
        """
        Envia mensagem de texto simples.

        Args:
            to: Número de WhatsApp do destinatário
            text: Texto da mensagem

        Returns:
            message_id: ID da mensagem enviada
        """
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": text}
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

    async def send_button_message(
        self,
        to: str,
        body_text: str,
        buttons: List[Dict[str, str]],
        header: Optional[str] = None,
        footer: Optional[str] = None
    ) -> str:
        """
        Envia mensagem com botões interativos (máximo 3 botões).

        Args:
            to: Número de WhatsApp do destinatário
            body_text: Texto principal da mensagem
            buttons: Lista de botões [{"id": "btn_1", "title": "Texto"}]
            header: Texto opcional do cabeçalho
            footer: Texto opcional do rodapé

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

    async def mark_as_read(self, message_id: str) -> bool:
        """
        Marca mensagem como lida.

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
            response.raise_for_status()
            data = response.json()

            return data["messages"][0]["id"]


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
