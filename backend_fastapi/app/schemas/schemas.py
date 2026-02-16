from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, date


# ==================== MENSAGENS ====================

class MensagemBase(BaseModel):
    whatsapp_number: str
    conteudo: str
    tipo_mensagem: str = "text"


class MensagemCreate(MensagemBase):
    dados_extras: Optional[Dict[str, Any]] = {}


class MensagemResponse(MensagemBase):
    id: int
    message_id: Optional[str]
    direcao: str
    timestamp: datetime
    lida: bool

    class Config:
        from_attributes = True


# ==================== CLIENTE ====================

class ClienteBase(BaseModel):
    nome_completo: str
    cpf: Optional[str] = None
    whatsapp_number: str


class ClienteCreate(ClienteBase):
    endereco_residencial: Optional[str] = None
    cep: Optional[str] = None
    complemento: Optional[str] = None
    cidade: Optional[str] = None


class ClienteResponse(ClienteBase):
    id: int
    endereco_residencial: Optional[str] = None
    cidade: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== ATENDIMENTO ====================

class AtendimentoBase(BaseModel):
    whatsapp_number: str


class AtendimentoCreate(AtendimentoBase):
    pass


class AtendimentoUpdate(BaseModel):
    atendente_id: Optional[int] = None
    status: Optional[str] = None
    notas_internas: Optional[str] = None


class AtendimentoResponse(AtendimentoBase):
    id: int
    atendente_id: Optional[int]
    status: str
    iniciado_em: datetime
    atribuido_em: Optional[datetime]
    finalizado_em: Optional[datetime]
    ultima_mensagem_em: datetime

    class Config:
        from_attributes = True


# ==================== ATENDENTE ====================

class AtendenteBase(BaseModel):
    nome_exibicao: str


class AtendenteCreate(AtendenteBase):
    user_id: int


class AtendenteUpdate(BaseModel):
    status: Optional[str] = None
    pode_atender: Optional[bool] = None


class AtendenteResponse(AtendenteBase):
    id: int
    status: str
    pode_atender: bool
    ultima_atividade: datetime

    class Config:
        from_attributes = True


# ==================== WEBHOOK ====================

class WebhookVerification(BaseModel):
    hub_mode: str = Field(alias="hub.mode")
    hub_verify_token: str = Field(alias="hub.verify_token")
    hub_challenge: str = Field(alias="hub.challenge")

    class Config:
        populate_by_name = True


class WhatsAppMessage(BaseModel):
    from_number: str
    message_id: str
    message_type: str
    message_content: Optional[str] = None
    timestamp: str


# ==================== CHAT ====================

class ConversaPreview(BaseModel):
    """Preview de conversa para lista lateral."""
    whatsapp_number: str
    cliente_nome: Optional[str] = None
    ultima_mensagem: Optional[str]
    timestamp: Optional[datetime]
    nao_lidas: int = 0
    atendente_nome: Optional[str] = None
    status: str = "bot"
    online_status: Optional[str] = None  # 'online', 'ausente', 'offline', None

    class Config:
        from_attributes = True


class ConversaDetalhes(BaseModel):
    """Detalhes completos da conversa."""
    whatsapp_number: str
    cliente: Optional[ClienteResponse] = None
    atendimento: Optional[AtendimentoResponse] = None
    mensagens: List[MensagemResponse] = []

    class Config:
        from_attributes = True


# ==================== SERVICOS ====================

class TipoServicoResponse(BaseModel):
    id: int
    categoria: str
    descricao: str
    preco: float

    class Config:
        from_attributes = True


class VagaAgendaResponse(BaseModel):
    id: int
    data: date
    quantidade_vagas: int

    class Config:
        from_attributes = True


# ==================== EMPRESA (MULTI-TENANT) ====================

class EmpresaBase(BaseModel):
    nome: str
    cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None


class EmpresaCreate(EmpresaBase):
    whatsapp_token: str
    phone_number_id: str
    verify_token: str
    waba_id: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    mercadopago_public_key: Optional[str] = None


class EmpresaUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    whatsapp_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    mercadopago_public_key: Optional[str] = None
    ativa: Optional[bool] = None


class EmpresaResponse(EmpresaBase):
    id: int
    phone_number_id: str
    ativa: bool
    criada_em: datetime
    atualizada_em: datetime

    class Config:
        from_attributes = True


class EmpresaComCredenciais(EmpresaResponse):
    """Schema com credenciais completas (apenas para admin)."""
    whatsapp_token: str
    verify_token: str
    waba_id: Optional[str] = None
    mercadopago_access_token: Optional[str] = None
    mercadopago_public_key: Optional[str] = None


# ==================== CONFIGURACAO BOT ====================

class ConfiguracaoBotBase(BaseModel):
    chave: str
    valor: str
    descricao: Optional[str] = None
    tipo_dado: str = "texto"


class ConfiguracaoBotCreate(ConfiguracaoBotBase):
    empresa_id: int


class ConfiguracaoBotUpdate(BaseModel):
    valor: Optional[str] = None
    descricao: Optional[str] = None


class ConfiguracaoBotResponse(ConfiguracaoBotBase):
    id: int
    empresa_id: int
    atualizada_em: datetime

    class Config:
        from_attributes = True


# ==================== BOT ESPECÍFICO ====================

class ChatSessaoResponse(BaseModel):
    id: int
    empresa_id: int
    whatsapp_number: str
    estado_atual: str
    dados_temporarios: Dict[str, Any]
    ultima_interacao: datetime

    class Config:
        from_attributes = True
