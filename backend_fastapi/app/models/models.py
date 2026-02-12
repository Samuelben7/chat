from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Numeric, Date, Index, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.database import Base


class Empresa(Base):
    """
    Modelo para multi-tenant - cada empresa tem suas credenciais WhatsApp.
    """
    __tablename__ = "empresa"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    cnpj = Column(String(18), unique=True)
    email = Column(String(255))
    telefone = Column(String(20))

    # Credenciais WhatsApp Business API
    whatsapp_token = Column(Text, nullable=False)
    phone_number_id = Column(String(50), unique=True, nullable=False, index=True)
    verify_token = Column(String(255), nullable=False)
    waba_id = Column(String(50), index=True)  # WhatsApp Business Account ID

    # Credenciais Mercado Pago (opcional)
    mercadopago_access_token = Column(Text)
    mercadopago_public_key = Column(String(255))

    # Autenticação (novo)
    admin_email = Column(String(255), unique=True)
    admin_senha_hash = Column(String(255))

    # Status
    ativa = Column(Boolean, default=True)
    criada_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizada_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    clientes = relationship("Cliente", back_populates="empresa")
    tipos_servico = relationship("TipoServico", back_populates="empresa")
    configuracoes_bot = relationship("ConfiguracaoBot", back_populates="empresa")
    atendentes = relationship("Atendente", back_populates="empresa")
    vagas_agenda = relationship("VagaAgenda", back_populates="empresa")
    auth = relationship("EmpresaAuth", back_populates="empresa", uselist=False)
    templates = relationship("MessageTemplate", back_populates="empresa", cascade="all, delete-orphan")
    listas_contatos = relationship("ListaContatos", back_populates="empresa", cascade="all, delete-orphan")


class ConfiguracaoBot(Base):
    """
    Configurações personalizáveis do bot por empresa.
    """
    __tablename__ = "configuracao_bot"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False)
    chave = Column(String(100), nullable=False)
    valor = Column(Text, nullable=False)
    descricao = Column(Text)
    tipo_dado = Column(String(20), default='texto')  # texto, numero, booleano, json
    atualizada_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    empresa = relationship("Empresa", back_populates="configuracoes_bot")

    __table_args__ = (
        Index('idx_empresa_chave', 'empresa_id', 'chave', unique=True),
    )


class Cliente(Base):
    __tablename__ = "whatsapp_bot_cliente"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    nome_completo = Column(String(255), nullable=False)
    cpf = Column(String(14), nullable=True, index=True)  # Nullable para contatos auto-criados
    endereco_residencial = Column(String(255))
    cep = Column(String(9))
    complemento = Column(String(100))
    cidade = Column(String(100))
    whatsapp_number = Column(String(20), nullable=False, index=True)
    email = Column(String(255))

    # Novos campos
    data_nascimento = Column(Date)
    foto_url = Column(String(500))

    # Relationships
    empresa = relationship("Empresa", back_populates="clientes")
    contratacoes = relationship("Contratacao", back_populates="cliente")
    reclamacoes = relationship("Reclamacao", back_populates="cliente")

    # Alias para facilitar uso
    @property
    def whatsapp(self):
        return self.whatsapp_number

    @property
    def nome(self):
        return self.nome_completo

    __table_args__ = (
        Index('idx_empresa_cpf', 'empresa_id', 'cpf'),
        Index('idx_empresa_whatsapp', 'empresa_id', 'whatsapp_number', unique=True),
    )


class TipoServico(Base):
    __tablename__ = "whatsapp_bot_tiposervico"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    categoria = Column(String(20), nullable=False)  # casa, apartamento, empresa
    descricao = Column(String(100), nullable=False)
    preco = Column(Numeric(10, 2), default=0.00)

    # Relationships
    empresa = relationship("Empresa", back_populates="tipos_servico")
    contratacoes = relationship("Contratacao", back_populates="tipo_servico")


class Contratacao(Base):
    __tablename__ = "whatsapp_bot_contratacao"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("whatsapp_bot_cliente.id"), nullable=False)
    tipo_servico_id = Column(Integer, ForeignKey("whatsapp_bot_tiposervico.id"), nullable=False)
    data_contratacao = Column(DateTime(timezone=True), server_default=func.now())
    status_pagamento = Column(String(20), default='pendente')  # pendente, pago, cancelado
    endereco_servico = Column(Text, nullable=False)

    # Relationships
    cliente = relationship("Cliente", back_populates="contratacoes")
    tipo_servico = relationship("TipoServico", back_populates="contratacoes")
    agendamento = relationship("Agendamento", back_populates="contratacao", uselist=False)

    __table_args__ = (
        Index('idx_status_pagamento', 'status_pagamento'),
    )


class VagaAgenda(Base):
    __tablename__ = "whatsapp_bot_vagaagenda"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    data = Column(Date, nullable=False, index=True)
    quantidade_vagas = Column(Integer, default=0)

    # Relationships
    empresa = relationship("Empresa", back_populates="vagas_agenda")
    agendamentos = relationship("Agendamento", back_populates="data_agendada")

    __table_args__ = (
        Index('idx_empresa_data', 'empresa_id', 'data', unique=True),
    )


class Agendamento(Base):
    __tablename__ = "whatsapp_bot_agendamento"

    id = Column(Integer, primary_key=True, index=True)
    contratacao_id = Column(Integer, ForeignKey("whatsapp_bot_contratacao.id"), unique=True, nullable=False)
    data_agendada_id = Column(Integer, ForeignKey("whatsapp_bot_vagaagenda.id"), nullable=False)
    status = Column(String(20), default='agendado')  # agendado, realizado, cancelado

    # Relationships
    contratacao = relationship("Contratacao", back_populates="agendamento")
    data_agendada = relationship("VagaAgenda", back_populates="agendamentos")


class Reclamacao(Base):
    __tablename__ = "whatsapp_bot_reclamacao"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("whatsapp_bot_cliente.id"), nullable=False)
    mensagem = Column(Text, nullable=False)
    data_reclamacao = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default='aberta')  # aberta, em_atendimento, resolvida

    # Relationships
    cliente = relationship("Cliente", back_populates="reclamacoes")


class ChatSessao(Base):
    __tablename__ = "whatsapp_bot_chatsessao"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    whatsapp_number = Column(String(20), nullable=False, index=True)
    estado_atual = Column(String(100), default='inicio')
    dados_temporarios = Column(JSON, default=dict)
    ultima_interacao = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_empresa_whatsapp_sessao', 'empresa_id', 'whatsapp_number', unique=True),
    )


class MensagemLog(Base):
    __tablename__ = "whatsapp_bot_mensagemlog"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    whatsapp_number = Column(String(20), nullable=False, index=True)
    message_id = Column(String(100), unique=True)
    direcao = Column(String(10), nullable=False)  # recebida, enviada
    tipo_mensagem = Column(String(20), nullable=False)  # text, interactive, button, list, template
    conteudo = Column(Text, nullable=False)
    dados_extras = Column(JSON, default=dict)
    estado_sessao = Column(String(100))
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    lida = Column(Boolean, default=False)
    erro = Column(Text)

    __table_args__ = (
        Index('idx_empresa_whatsapp_timestamp', 'empresa_id', 'whatsapp_number', 'timestamp'),
        Index('idx_direcao_timestamp', 'direcao', 'timestamp'),
    )


class Atendente(Base):
    __tablename__ = "painel_atendente"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False)  # FK para auth_user (se usar Django) ou ID de usuário
    nome_exibicao = Column(String(100), nullable=False)
    email = Column(String(255))
    senha_hash = Column(String(255))  # Para autenticação própria (futuro)
    status = Column(String(10), default='offline')  # online, offline, ausente
    foto = Column(String(255))
    ultima_atividade = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    pode_atender = Column(Boolean, default=True)

    # Novos campos
    data_nascimento = Column(Date)
    cpf = Column(String(14), unique=True)
    foto_url = Column(String(500))

    # Relationships
    empresa = relationship("Empresa", back_populates="atendentes")
    atendimentos = relationship("Atendimento", back_populates="atendente")
    auth = relationship("AtendenteAuth", back_populates="atendente", uselist=False)

    __table_args__ = (
        Index('idx_empresa_user', 'empresa_id', 'user_id', unique=True),
    )


class Atendimento(Base):
    __tablename__ = "painel_atendimento"

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_number = Column(String(20), nullable=False, index=True)
    atendente_id = Column(Integer, ForeignKey("painel_atendente.id"))
    status = Column(String(20), default='bot')  # aguardando, em_atendimento, finalizado, bot
    iniciado_em = Column(DateTime(timezone=True), server_default=func.now())
    atribuido_em = Column(DateTime(timezone=True))
    finalizado_em = Column(DateTime(timezone=True))
    ultima_mensagem_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)
    notas_internas = Column(Text)

    # Relationships
    atendente = relationship("Atendente", back_populates="atendimentos")

    __table_args__ = (
        Index('idx_whatsapp_status', 'whatsapp_number', 'status'),
    )


class EmpresaAuth(Base):
    """
    Tabela de autenticação para empresas (admin/owner)
    """
    __tablename__ = "empresa_auth"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_login = Column(DateTime(timezone=True))

    # Relationships
    empresa = relationship("Empresa", back_populates="auth")


class AtendenteAuth(Base):
    """
    Tabela de autenticação para atendentes
    """
    __tablename__ = "atendente_auth"

    id = Column(Integer, primary_key=True, index=True)
    atendente_id = Column(Integer, ForeignKey("painel_atendente.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    primeiro_login = Column(Boolean, default=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_login = Column(DateTime(timezone=True))

    # Relationships
    atendente = relationship("Atendente", back_populates="auth")

# ==================== BOT BUILDER ====================

class BotFluxo(Base):
    """
    Fluxo principal do bot builder
    """
    __tablename__ = "bot_fluxo"
    
    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(255), nullable=False)
    descricao = Column(Text)
    ativo = Column(Boolean, default=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    empresa = relationship("Empresa")
    nos = relationship("BotFluxoNo", back_populates="fluxo", cascade="all, delete-orphan")


class BotFluxoNo(Base):
    """
    Nó/Etapa do fluxo do bot
    """
    __tablename__ = "bot_fluxo_no"
    
    id = Column(Integer, primary_key=True, index=True)
    fluxo_id = Column(Integer, ForeignKey("bot_fluxo.id", ondelete="CASCADE"), nullable=False, index=True)
    identificador = Column(String(100), nullable=False)  # 'inicio', 'saudacao', 'menu_principal', etc
    tipo = Column(String(50), nullable=False)  # 'mensagem', 'lista', 'botoes', 'condicional', 'transferir_atendente'
    titulo = Column(String(255))
    conteudo = Column(Text)
    dados_extras = Column(JSON, default={})
    proximo_no_id = Column(Integer, ForeignKey("bot_fluxo_no.id", ondelete="SET NULL"))
    ordem = Column(Integer, default=0)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    fluxo = relationship("BotFluxo", back_populates="nos")
    opcoes = relationship("BotFluxoOpcao", back_populates="no", cascade="all, delete-orphan", foreign_keys="[BotFluxoOpcao.no_id]")
    proximo_no = relationship("BotFluxoNo", remote_side=[id], foreign_keys=[proximo_no_id])


class BotFluxoOpcao(Base):
    """
    Opções de listas e botões do bot
    """
    __tablename__ = "bot_fluxo_opcao"
    
    id = Column(Integer, primary_key=True, index=True)
    no_id = Column(Integer, ForeignKey("bot_fluxo_no.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String(50), nullable=False)  # 'lista_item', 'botao', 'resposta_rapida'
    titulo = Column(String(255), nullable=False)
    descricao = Column(Text)
    valor = Column(String(255))
    proximo_no_id = Column(Integer, ForeignKey("bot_fluxo_no.id", ondelete="SET NULL"))
    ordem = Column(Integer, default=0)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    no = relationship("BotFluxoNo", back_populates="opcoes", foreign_keys=[no_id])
    proximo_no = relationship("BotFluxoNo", foreign_keys=[proximo_no_id])


class TokenConfirmacaoEmail(Base):
    """
    Tokens para confirmação de email de novas empresas
    """
    __tablename__ = "token_confirmacao_email"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False)
    usado = Column(Boolean, default=False)
    expira_em = Column(DateTime(timezone=True), nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())


# ==================== TEMPLATES ====================

class MessageTemplate(Base):
    """
    Templates de mensagem do WhatsApp Business API
    """
    __tablename__ = "message_template"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False, index=True)
    meta_template_id = Column(String(100))  # ID retornado pela Meta API
    waba_id = Column(String(50))
    name = Column(String(512), nullable=False)
    category = Column(String(50), nullable=False)  # MARKETING, UTILITY, AUTHENTICATION
    language = Column(String(10), nullable=False, default='pt_BR')
    status = Column(String(20), nullable=False, default='PENDING')  # PENDING, APPROVED, REJECTED, PAUSED, DISABLED, DELETED
    components = Column(JSON, default=list)
    parameter_format = Column(String(20))
    quality_score = Column(String(20))
    rejected_reason = Column(Text)
    header_image_path = Column(String(500))  # Path local da imagem de header
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    empresa = relationship("Empresa", back_populates="templates")

    __table_args__ = (
        Index('idx_template_empresa_name_lang', 'empresa_id', 'name', 'language', unique=True),
        Index('idx_template_empresa_status', 'empresa_id', 'status'),
    )


# ==================== LISTAS DE CONTATOS ====================

class ListaContatos(Base):
    """
    Listas de contatos para envio em massa
    """
    __tablename__ = "lista_contatos"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(255), nullable=False)
    descricao = Column(Text)
    cor = Column(String(7), default='#3B82F6')  # Hex color for UI badge
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    empresa = relationship("Empresa", back_populates="listas_contatos")
    membros = relationship("ListaContatosMembro", back_populates="lista", cascade="all, delete-orphan")


class ListaContatosMembro(Base):
    """
    Membros de uma lista de contatos
    """
    __tablename__ = "lista_contatos_membro"

    id = Column(Integer, primary_key=True, index=True)
    lista_id = Column(Integer, ForeignKey("lista_contatos.id", ondelete="CASCADE"), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey("whatsapp_bot_cliente.id", ondelete="SET NULL"))
    whatsapp_number = Column(String(20), nullable=False)
    nome = Column(String(255))
    adicionado_em = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    lista = relationship("ListaContatos", back_populates="membros")
    cliente = relationship("Cliente")

    __table_args__ = (
        Index('idx_lista_membro_unico', 'lista_id', 'whatsapp_number', unique=True),
    )
