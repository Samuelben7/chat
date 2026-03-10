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

    # Mensagem de encerramento + Pesquisa de satisfação
    mensagem_encerramento = Column(Text, default="Seu atendimento foi encerrado. Muito obrigado por entrar em contato!")
    pesquisa_satisfacao_ativa = Column(Boolean, default=False)

    # IA Conversacional
    ia_ativa = Column(Boolean, default=False)
    ia_contexto = Column(Text)  # contexto/instruções do negócio para a IA
    ia_delay_min = Column(Integer, default=3)   # delay mínimo em segundos
    ia_delay_max = Column(Integer, default=10)  # delay máximo em segundos
    ia_nome_assistente = Column(String(100), default="Assistente")

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
    campos_custom = relationship("CampoCustomCliente", back_populates="empresa", cascade="all, delete-orphan")


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

    # Dados pessoais
    data_nascimento = Column(Date)
    rg = Column(String(20))
    telefone_secundario = Column(String(20))

    # Endereço completo
    bairro = Column(String(100))
    estado = Column(String(50))
    pais = Column(String(100))

    # Profissional / Financeiro
    profissao = Column(String(100))
    empresa_cliente = Column(String(255))
    chave_pix = Column(String(255))

    # Sistema
    foto_url = Column(String(500))

    # CRM - Funil de Vendas
    funil_etapa = Column(String(30), default='novo_lead')  # novo_lead/pediu_orcamento/orcamento_enviado/negociacao/fechado/perdido
    valor_estimado = Column(Numeric(12, 2), nullable=True)
    responsavel_id = Column(Integer, ForeignKey('painel_atendente.id', ondelete='SET NULL'), nullable=True)
    resumo_conversa = Column(Text, nullable=True)
    preferencias = Column(Text, nullable=True)
    observacoes_crm = Column(Text, nullable=True)
    crm_arquivado = Column(Boolean, default=False)
    crm_arquivado_em = Column(DateTime, nullable=True)
    criado_em_crm = Column(DateTime, server_default=func.now())
    atualizado_em_crm = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    empresa = relationship("Empresa", back_populates="clientes")
    contratacoes = relationship("Contratacao", back_populates="cliente")
    reclamacoes = relationship("Reclamacao", back_populates="cliente")
    responsavel = relationship("Atendente", foreign_keys=[responsavel_id])
    crm_tags = relationship("CrmClienteTag", back_populates="cliente", cascade="all, delete-orphan")
    campos_custom_valores = relationship("ClienteValorCustom", back_populates="cliente", cascade="all, delete-orphan")

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
    empresa_id = Column(Integer, ForeignKey("empresa.id"), nullable=True, index=True)
    whatsapp_number = Column(String(20), nullable=False, index=True)
    atendente_id = Column(Integer, ForeignKey("painel_atendente.id"))
    status = Column(String(20), default='bot')  # aguardando, em_atendimento, finalizado, bot
    iniciado_em = Column(DateTime(timezone=True), server_default=func.now())
    atribuido_em = Column(DateTime(timezone=True))
    finalizado_em = Column(DateTime(timezone=True))
    ultima_mensagem_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)
    notas_internas = Column(Text)
    protocolo = Column(String(10), nullable=True)
    motivo_encerramento = Column(String(100), nullable=True)
    observacao_encerramento = Column(Text, nullable=True)
    nota_satisfacao = Column(Integer, nullable=True)  # 1 a 5
    atendido_por_ia = Column(Boolean, default=False)

    # Relationships
    atendente = relationship("Atendente", back_populates="atendimentos")

    __table_args__ = (
        Index('idx_whatsapp_status', 'whatsapp_number', 'status'),
        Index('idx_atendimento_empresa', 'empresa_id'),
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


# ==================== AGENDA INTELIGENTE ====================

class AgendaHorarioFuncionamento(Base):
    """Horários de funcionamento por dia da semana."""
    __tablename__ = 'agenda_horario_funcionamento'

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey('empresa.id'), nullable=False, index=True)
    dia_semana = Column(Integer, nullable=False)  # 0=domingo..6=sábado
    hora_inicio = Column(String(5), nullable=False)  # HH:MM
    hora_fim = Column(String(5), nullable=False)
    intervalo_minutos = Column(Integer, default=60)
    vagas_por_slot = Column(Integer, default=1)
    ativo = Column(Boolean, default=True)


class AgendaSlot(Base):
    """Slot de tempo disponível para agendamento."""
    __tablename__ = 'agenda_slot'

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey('empresa.id'), nullable=False)
    data = Column(Date, nullable=False)
    hora_inicio = Column(String(5), nullable=False)
    hora_fim = Column(String(5), nullable=False)
    vagas_total = Column(Integer, default=1)
    vagas_ocupadas = Column(Integer, default=0)
    status = Column(String(20), default='disponivel')  # disponivel/lotado/bloqueado
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now())

    agendamentos = relationship('AgendaAgendamento', back_populates='slot', cascade='all, delete-orphan')

    __table_args__ = (
        Index('idx_slot_empresa_data', 'empresa_id', 'data'),
    )


class AgendaAgendamento(Base):
    """Agendamento de cliente em um slot."""
    __tablename__ = 'agenda_agendamento'

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey('empresa.id'), nullable=False, index=True)
    slot_id = Column(Integer, ForeignKey('agenda_slot.id'), nullable=False, index=True)
    cliente_id = Column(Integer, ForeignKey('whatsapp_bot_cliente.id'), nullable=True)
    whatsapp_number = Column(String(20), nullable=False)
    nome_cliente = Column(String(150), nullable=True)
    status = Column(String(20), default='confirmado')  # pendente/confirmado/cancelado/realizado
    observacoes = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    slot = relationship('AgendaSlot', back_populates='agendamentos')
    cliente = relationship('Cliente')


# ==================== CRM - TAGS & KANBAN ====================

class CrmTag(Base):
    """Tags coloridas para classificar clientes/leads."""
    __tablename__ = 'crm_tag'

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False, index=True)
    nome = Column(String(50), nullable=False)
    cor = Column(String(7), default='#3B82F6')   # hex color
    emoji = Column(String(10), nullable=True)
    criado_em = Column(DateTime, server_default=func.now())

    clientes = relationship('CrmClienteTag', back_populates='tag', cascade='all, delete-orphan')


class CrmClienteTag(Base):
    """Relacionamento many-to-many entre Cliente e Tag."""
    __tablename__ = 'crm_cliente_tag'

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False)
    cliente_id = Column(Integer, ForeignKey('whatsapp_bot_cliente.id', ondelete='CASCADE'), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey('crm_tag.id', ondelete='CASCADE'), nullable=False)
    adicionado_em = Column(DateTime, server_default=func.now())

    cliente = relationship('Cliente', back_populates='crm_tags')
    tag = relationship('CrmTag', back_populates='clientes')


# ==================== DEV API GATEWAY ====================

class DevUsuario(Base):
    """Desenvolvedor que usa a API Gateway para enviar mensagens WhatsApp."""
    __tablename__ = "dev_usuario"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    telefone = Column(String(20))
    empresa_nome = Column(String(255))

    # Credenciais WhatsApp (via Embedded Signup)
    whatsapp_token = Column(Text)
    phone_number_id = Column(String(50), unique=True, index=True)
    waba_id = Column(String(50), index=True)
    verify_token = Column(String(255))

    # Webhook do dev
    webhook_url = Column(Text)
    webhook_secret = Column(String(255))

    # Cartao salvo para cobrança automatica (Customer + Card MP)
    mp_customer_id = Column(String(100), index=True)   # ID do Customer no MP
    mp_card_id = Column(String(100))                   # ID do cartao salvo no MP
    mp_card_last4 = Column(String(4))                  # Ultimos 4 digitos (display)
    mp_card_method = Column(String(30))                # visa/master/etc
    proximo_cobr_numeros = Column(DateTime(timezone=True))  # Proxima cobrança de numeros

    # Status e trial
    status = Column(String(20), default='trial')  # trial/active/overdue/blocked
    trial_inicio = Column(DateTime(timezone=True), server_default=func.now())
    trial_fim = Column(DateTime(timezone=True))

    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    auth = relationship("DevAuth", back_populates="dev", uselist=False)
    api_keys = relationship("ApiKey", back_populates="dev", cascade="all, delete-orphan")
    numeros = relationship("DevNumero", back_populates="dev", cascade="all, delete-orphan")
    assinaturas = relationship("Assinatura", back_populates="dev")
    gateway_logs = relationship("GatewayLog", back_populates="dev")


class DevAuth(Base):
    """Autenticacao do desenvolvedor (email/senha)."""
    __tablename__ = "dev_auth"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_login = Column(DateTime(timezone=True))

    # Relationships
    dev = relationship("DevUsuario", back_populates="auth")


class ApiKey(Base):
    """Chave de API para autenticacao no gateway."""
    __tablename__ = "api_key"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="CASCADE"), nullable=False, index=True)
    key_prefix = Column(String(8), nullable=False, index=True)
    key_hash = Column(String(255), nullable=False)
    nome = Column(String(100))
    ativa = Column(Boolean, default=True)
    ultima_utilizacao = Column(DateTime(timezone=True))
    criada_em = Column(DateTime(timezone=True), server_default=func.now())
    revogada_em = Column(DateTime(timezone=True))

    # Relationships
    dev = relationship("DevUsuario", back_populates="api_keys")
    gateway_logs = relationship("GatewayLog", back_populates="api_key")


class DevNumero(Base):
    """Numero WhatsApp vinculado a um desenvolvedor (suporte multi-numero)."""
    __tablename__ = "dev_numero"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="CASCADE"), nullable=False, index=True)
    phone_number_id = Column(String(50), unique=True, nullable=False, index=True)
    waba_id = Column(String(50), nullable=False)
    whatsapp_token = Column(Text, nullable=False)
    display_phone_number = Column(String(30))
    verified_name = Column(String(255))

    # Billing Mercado Pago
    mp_preapproval_id = Column(String(100), index=True)   # ID da assinatura MP
    mp_subscription_status = Column(String(30))            # authorized/pending/cancelled
    mp_init_point = Column(Text)                           # link de pagamento para o dev autorizar

    # Status do numero na plataforma
    status = Column(String(20), default='pending')  # pending/active/suspended/cancelled
    primeiro_uso_em = Column(DateTime(timezone=True))
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    dev = relationship("DevUsuario", back_populates="numeros")


# ==================== PLANOS & ASSINATURAS ====================

class Plano(Base):
    """Planos de assinatura (empresa ou dev)."""
    __tablename__ = "plano"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(20), nullable=False)  # empresa / dev
    nome = Column(String(100), nullable=False)
    preco_mensal = Column(Numeric(10, 2), nullable=False)
    descricao = Column(Text)
    features = Column(JSON, default=list)
    limites = Column(JSON, default=dict)  # {mensagens_mes, requests_min, atendentes}
    ativo = Column(Boolean, default=True)
    ordem = Column(Integer, default=0)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    assinaturas = relationship("Assinatura", back_populates="plano")


class Assinatura(Base):
    """Assinatura ativa de empresa ou dev."""
    __tablename__ = "assinatura"

    id = Column(Integer, primary_key=True, index=True)
    tipo_usuario = Column(String(20), nullable=False)  # empresa / dev
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="SET NULL"), nullable=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="SET NULL"), nullable=True, index=True)
    plano_id = Column(Integer, ForeignKey("plano.id"), nullable=False, index=True)

    status = Column(String(20), default='active')  # active/overdue/blocked/cancelled
    data_inicio = Column(DateTime(timezone=True), server_default=func.now())
    data_proximo_vencimento = Column(DateTime(timezone=True))
    data_bloqueio = Column(DateTime(timezone=True))

    # Relationships
    empresa = relationship("Empresa")
    dev = relationship("DevUsuario", back_populates="assinaturas")
    plano = relationship("Plano", back_populates="assinaturas")
    pagamentos = relationship("Pagamento", back_populates="assinatura")


class Pagamento(Base):
    """Pagamento de assinatura via Mercado Pago."""
    __tablename__ = "pagamento"

    id = Column(Integer, primary_key=True, index=True)
    assinatura_id = Column(Integer, ForeignKey("assinatura.id"), nullable=False, index=True)
    tipo_usuario = Column(String(20), nullable=False)  # empresa / dev
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="SET NULL"), nullable=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="SET NULL"), nullable=True)

    valor = Column(Numeric(10, 2), nullable=False)
    metodo = Column(String(20), nullable=False)  # pix / credit_card
    status = Column(String(20), default='pending')  # pending/approved/rejected/refunded

    # Mercado Pago
    mp_payment_id = Column(String(100), index=True)
    mp_pix_qr_code = Column(Text)
    mp_pix_qr_code_base64 = Column(Text)
    dados_extras = Column(JSON, default=dict)

    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    assinatura = relationship("Assinatura", back_populates="pagamentos")

    __table_args__ = (
        Index('idx_pagamento_mp_id', 'mp_payment_id'),
        Index('idx_pagamento_status', 'status'),
    )


class GatewayLog(Base):
    """Log de requisicoes no API Gateway."""
    __tablename__ = "gateway_log"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="CASCADE"), nullable=False, index=True)
    api_key_id = Column(Integer, ForeignKey("api_key.id", ondelete="SET NULL"), nullable=True)
    endpoint = Column(String(255))
    status_code = Column(Integer)
    latency_ms = Column(Integer)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    dev = relationship("DevUsuario", back_populates="gateway_logs")
    api_key = relationship("ApiKey", back_populates="gateway_logs")


# ==================== RECUPERAÇÃO DE SENHA ====================

class ModeloMensagem(Base):
    """
    Modelos de mensagem customizados para envio em massa (texto, imagem, botões, lista).
    Independentes dos templates Meta — criados e gerenciados pelo próprio usuário.
    """
    __tablename__ = "modelo_mensagem"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(255), nullable=False)
    tipo = Column(String(20), nullable=False, default="text")  # text, image, button, list
    mensagem = Column(Text, nullable=False)
    header = Column(String(500), nullable=True)
    footer = Column(String(500), nullable=True)
    media_url = Column(String(1000), nullable=True)  # URL completa da imagem
    buttons = Column(JSON, nullable=True)   # [{id, title}]
    button_text = Column(String(100), nullable=True)  # texto do botão de lista
    sections = Column(JSON, nullable=True)  # [{title, rows: [{id, title, description}]}]
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa")


class TokenResetSenha(Base):
    """Tokens para recuperação de senha (empresa, atendente ou dev)."""
    __tablename__ = "tokens_reset_senha"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    tipo = Column(String(20), nullable=False)  # 'empresa', 'atendente', 'dev'
    usado = Column(Boolean, default=False)
    expira_em = Column(DateTime, nullable=False)
    criado_em = Column(DateTime, server_default=func.now())


class TokenConfirmacaoEmailDev(Base):
    """Tokens para confirmação de email de novos desenvolvedores."""
    __tablename__ = "tokens_confirmacao_email_dev"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer, ForeignKey("dev_usuario.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    usado = Column(Boolean, default=False)
    expira_em = Column(DateTime, nullable=False)
    criado_em = Column(DateTime, server_default=func.now())


# ==================== CLIENTES CUSTOM FIELDS ====================

class CampoCustomCliente(Base):
    """Definição de campos customizados por empresa para clientes."""
    __tablename__ = "campo_custom_cliente"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresa.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False)
    tipo = Column(String(20), nullable=False, default='texto')  # texto, numero, data, opcoes, booleano
    opcoes = Column(JSON, nullable=True)  # lista de opções para tipo='opcoes'
    obrigatorio = Column(Boolean, default=False)
    ativo = Column(Boolean, default=True)
    ordem = Column(Integer, default=0)
    criado_em = Column(DateTime, server_default=func.now())

    empresa = relationship("Empresa", back_populates="campos_custom")
    valores = relationship("ClienteValorCustom", back_populates="campo", cascade="all, delete-orphan")


class ClienteValorCustom(Base):
    """Valores de campos customizados por cliente."""
    __tablename__ = "cliente_valor_custom"

    id = Column(Integer, primary_key=True)
    cliente_id = Column(Integer, ForeignKey("whatsapp_bot_cliente.id", ondelete="CASCADE"), nullable=False, index=True)
    campo_id = Column(Integer, ForeignKey("campo_custom_cliente.id", ondelete="CASCADE"), nullable=False)
    valor = Column(Text, nullable=True)
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    cliente = relationship("Cliente", back_populates="campos_custom_valores")
    campo = relationship("CampoCustomCliente", back_populates="valores")

    __table_args__ = (
        Index('idx_valor_custom_cliente_campo', 'cliente_id', 'campo_id', unique=True),
    )
