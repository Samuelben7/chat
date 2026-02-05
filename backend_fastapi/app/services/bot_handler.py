"""
Handler principal do bot - gerencia toda a lógica de conversação (multi-tenant).
Baseado na máquina de estados do bot original.
"""
from typing import Optional, Dict, List
from datetime import datetime, date
from sqlalchemy.orm import Session
import logging

from app.models.models import (
    Empresa,
    Cliente,
    TipoServico,
    Contratacao,
    VagaAgenda,
    Agendamento,
    Reclamacao,
    ChatSessao,
    MensagemLog,
)
from app.services.whatsapp import WhatsAppService
from app.services.validators import (
    validar_cpf,
    formatar_cpf,
    consultar_cep,
)

logger = logging.getLogger(__name__)


class BotMessageHandler:
    """
    Gerencia toda a lógica de conversação do bot (multi-tenant).
    """

    def __init__(
        self,
        empresa: Empresa,
        from_number: str,
        message_content: str,
        message_id: Optional[str],
        db: Session
    ):
        """
        Inicializa o handler do bot.

        Args:
            empresa: Empresa dona do número WhatsApp
            from_number: Número do cliente
            message_content: Conteúdo da mensagem
            message_id: ID da mensagem WhatsApp
            db: Sessão do banco de dados
        """
        self.empresa = empresa
        self.from_number = from_number
        self.message_content = message_content
        self.message_id = message_id
        self.db = db

        # Busca ou cria sessão
        self.session = self.db.query(ChatSessao).filter(
            ChatSessao.empresa_id == empresa.id,
            ChatSessao.whatsapp_number == from_number
        ).first()

        if not self.session:
            self.session = ChatSessao(
                empresa_id=empresa.id,
                whatsapp_number=from_number,
                estado_atual='inicio',
                dados_temporarios={}
            )
            self.db.add(self.session)
            self.db.commit()

        # Inicializa serviço WhatsApp
        self.whatsapp = WhatsAppService(empresa)

    def log_message_received(self, tipo_mensagem: str = 'text', dados_extras: dict = None):
        """Registra mensagem recebida no log."""
        mensagem = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=self.from_number,
            message_id=self.message_id,
            direcao='recebida',
            tipo_mensagem=tipo_mensagem,
            conteudo=self.message_content,
            dados_extras=dados_extras or {},
            estado_sessao=self.session.estado_atual,
        )
        self.db.add(mensagem)
        self.db.commit()

    def log_message_sent(self, conteudo: str, tipo_mensagem: str = 'text', dados_extras: dict = None, erro: str = None):
        """Registra mensagem enviada no log."""
        mensagem = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=self.from_number,
            direcao='enviada',
            tipo_mensagem=tipo_mensagem,
            conteudo=conteudo,
            dados_extras=dados_extras or {},
            estado_sessao=self.session.estado_atual,
            erro=erro,
        )
        self.db.add(mensagem)
        self.db.commit()

    async def send_message(self, text: str):
        """Envia mensagem de texto e registra no log."""
        try:
            await self.whatsapp.send_text_message(self.from_number, text)
            self.log_message_sent(text, 'text')
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar mensagem: {e}")
            self.log_message_sent(text, 'text', erro=str(e))
            return False

    async def send_buttons(self, body_text: str, buttons: list, header: str = None, footer: str = None):
        """Envia mensagem com botões e registra no log."""
        try:
            await self.whatsapp.send_button_message(self.from_number, body_text, buttons, header, footer)
            self.log_message_sent(
                body_text,
                'button',
                dados_extras={'buttons': buttons, 'header': header, 'footer': footer}
            )
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar botões: {e}")
            self.log_message_sent(body_text, 'button', erro=str(e))
            return False

    async def send_list(self, body_text: str, button_text: str, sections: list, header: str = None, footer: str = None):
        """Envia mensagem com lista e registra no log."""
        try:
            await self.whatsapp.send_list_message(self.from_number, body_text, button_text, sections, header, footer)
            self.log_message_sent(
                body_text,
                'list',
                dados_extras={'sections': sections, 'button_text': button_text, 'header': header, 'footer': footer}
            )
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar lista: {e}")
            self.log_message_sent(body_text, 'list', erro=str(e))
            return False

    def update_session_state(self, new_state: str, dados_temp: dict = None):
        """Atualiza estado da sessão."""
        self.session.estado_atual = new_state
        if dados_temp is not None:
            # SQLAlchemy não detecta mudanças em JSON com .update()
            # Precisamos reatribuir o dict inteiro
            temp_data = self.session.dados_temporarios.copy()
            temp_data.update(dados_temp)
            self.session.dados_temporarios = temp_data
        self.db.commit()

    async def process_message(self):
        """
        Processa a mensagem recebida baseado no estado atual da sessão.
        """
        # Log da mensagem recebida
        self.log_message_received()

        # Marca mensagem como lida
        if self.message_id:
            try:
                await self.whatsapp.mark_as_read(self.message_id)
            except:
                pass

        # Roteamento baseado em estado
        estado = self.session.estado_atual

        handlers = {
            'inicio': self.handle_inicio,
            'menu_principal': self.handle_menu_principal,
            'menu_contratacao': self.handle_menu_contratacao,
            'aguardando_cpf': self.handle_aguardando_cpf,
            'cadastro_nome': self.handle_cadastro_nome,
            'cadastro_cpf': self.handle_cadastro_cpf,
            'cadastro_cep': self.handle_cadastro_cep,
            'cadastro_complemento': self.handle_cadastro_complemento,
            'menu_cliente_existente': self.handle_menu_cliente_existente,
            'suporte_tecnico': self.handle_suporte_tecnico,
            'contratar_novo_servico': self.handle_contratar_novo_servico,
            'escolhendo_categoria_servico': self.handle_escolhendo_categoria_servico,
            'escolhendo_servico': self.handle_escolhendo_servico,
            'informando_endereco_servico': self.handle_informando_endereco_servico,
            'agendando_servico': self.handle_agendando_servico,
            'pagamento': self.handle_pagamento,
        }

        handler = handlers.get(estado, self.handle_inicio)
        await handler()

    async def handle_inicio(self):
        """Estado inicial - mostra menu principal."""
        await self.send_buttons(
            body_text=f"Olá! Bem-vindo à {self.empresa.nome}. Como posso ajudar você hoje?",
            buttons=[
                {"id": "btn_contratacao", "title": "Contratação"},
                {"id": "btn_empresas", "title": "Empresas"}
            ],
            header="🏗️ Menu Principal"
        )
        self.update_session_state('menu_principal')

    async def handle_menu_principal(self):
        """Processa seleção do menu principal."""
        if self.message_content == 'btn_contratacao':
            await self.send_buttons(
                body_text="Você já é nosso cliente ou é novo por aqui?",
                buttons=[
                    {"id": "btn_ja_cliente", "title": "Já sou cliente"},
                    {"id": "btn_novo_cliente", "title": "Novo Cliente"}
                ],
                header="📋 Contratação"
            )
            self.update_session_state('menu_contratacao')

        elif self.message_content == 'btn_empresas':
            await self.send_message(
                "📞 Para atendimento empresarial, entre em contato diretamente com nossa equipe.\n\n"
                f"Telefone: {self.empresa.telefone or 'Em breve'}"
            )
            self.update_session_state('inicio')

        else:
            await self.send_message("Desculpe, não entendi. Por favor, use os botões para navegar.")
            await self.handle_inicio()

    async def handle_menu_contratacao(self):
        """Processa menu de contratação."""
        if self.message_content == 'btn_ja_cliente':
            await self.send_message("Por favor, informe seu CPF (apenas números):")
            self.update_session_state('aguardando_cpf')

        elif self.message_content == 'btn_novo_cliente':
            await self.send_message("Vamos fazer seu cadastro! Por favor, informe seu nome completo:")
            self.update_session_state('cadastro_nome')

        else:
            await self.send_message("Por favor, use os botões para selecionar uma opção.")

    async def handle_aguardando_cpf(self):
        """Valida CPF e busca cliente."""
        cpf = self.message_content.strip()

        if not validar_cpf(cpf):
            await self.send_message(
                "❌ CPF inválido. Por favor, digite um CPF válido (apenas números):"
            )
            return

        cpf_formatado = formatar_cpf(cpf)

        cliente = self.db.query(Cliente).filter(
            Cliente.empresa_id == self.empresa.id,
            Cliente.cpf == cpf_formatado
        ).first()

        if cliente:
            self.update_session_state('menu_cliente_existente', {'cliente_id': cliente.id})

            # Verifica se tem contratações
            tem_contratacoes = self.db.query(Contratacao).filter(
                Contratacao.cliente_id == cliente.id
            ).count() > 0

            if tem_contratacoes:
                await self.send_buttons(
                    body_text=f"Olá, {cliente.nome_completo}! 👋\n\nO que você gostaria de fazer?",
                    buttons=[
                        {"id": "btn_suporte", "title": "Suporte Técnico"},
                        {"id": "btn_contratacoes", "title": "Minhas Contratações"}
                    ],
                    header="✅ Cliente Identificado"
                )
            else:
                await self.send_buttons(
                    body_text=f"Olá, {cliente.nome_completo}! 👋\n\nVocê ainda não possui contratações.",
                    buttons=[
                        {"id": "btn_suporte", "title": "Suporte Técnico"},
                        {"id": "btn_nova_contratacao", "title": "Nova Contratação"}
                    ],
                    header="✅ Cliente Identificado"
                )
        else:
            await self.send_buttons(
                body_text="CPF não encontrado em nossa base. O que deseja fazer?",
                buttons=[
                    {"id": "btn_ja_cliente", "title": "Tentar novamente"},
                    {"id": "btn_novo_cliente", "title": "Fazer cadastro"}
                ],
                header="❌ Cliente não encontrado"
            )
            self.update_session_state('menu_contratacao')

    async def handle_cadastro_nome(self):
        """Recebe nome do novo cliente."""
        nome = self.message_content.strip()

        if len(nome) < 3:
            await self.send_message("Por favor, informe seu nome completo:")
            return

        self.update_session_state('cadastro_cpf', {'nome_completo': nome})
        await self.send_message(f"Prazer, {nome}! 😊\n\nAgora, informe seu CPF (apenas números):")

    async def handle_cadastro_cpf(self):
        """Valida e salva CPF do novo cliente."""
        cpf = self.message_content.strip()

        if not validar_cpf(cpf):
            await self.send_message("❌ CPF inválido. Por favor, digite um CPF válido (apenas números):")
            return

        cpf_formatado = formatar_cpf(cpf)

        # Verifica se CPF já existe
        if self.db.query(Cliente).filter(
            Cliente.empresa_id == self.empresa.id,
            Cliente.cpf == cpf_formatado
        ).first():
            await self.send_message(
                "⚠️ Este CPF já está cadastrado. Por favor, use a opção 'Já sou cliente' no menu inicial."
            )
            self.update_session_state('inicio')
            await self.handle_inicio()
            return

        self.update_session_state('cadastro_cep', {'cpf': cpf_formatado})
        await self.send_message("Informe seu CEP (apenas números):")

    async def handle_cadastro_cep(self):
        """Consulta CEP e pede complemento."""
        cep = self.message_content.strip()
        dados_cep = await consultar_cep(cep)

        if not dados_cep:
            await self.send_message("❌ CEP não encontrado. Por favor, tente novamente:")
            return

        self.update_session_state('cadastro_complemento', {
            'cep': dados_cep['cep'],
            'endereco_residencial': dados_cep['logradouro'],
            'cidade': dados_cep['cidade'],
            'uf': dados_cep['uf'],
            'bairro': dados_cep['bairro']
        })

        await self.send_message(
            f"📍 Endereço encontrado:\n{dados_cep['endereco_completo']}\n\n"
            f"Informe o número e complemento (ex: 123, Apto 4B):"
        )

    async def handle_cadastro_complemento(self):
        """Finaliza cadastro do cliente."""
        complemento_input = self.message_content.strip()

        # Separa número e complemento
        partes = complemento_input.split(',')
        numero = partes[0].strip()
        complemento = partes[1].strip() if len(partes) > 1 else ''

        dados = self.session.dados_temporarios
        endereco_completo = f"{dados['endereco_residencial']}, {numero}"

        try:
            cliente = Cliente(
                empresa_id=self.empresa.id,
                nome_completo=dados['nome_completo'],
                cpf=dados['cpf'],
                endereco_residencial=endereco_completo,
                cep=dados['cep'],
                complemento=complemento,
                cidade=dados['cidade'],
                whatsapp_number=self.from_number
            )
            self.db.add(cliente)
            self.db.commit()

            await self.send_message(
                f"✅ Cadastro realizado com sucesso, {cliente.nome_completo}!\n\n"
                f"Agora você pode contratar nossos serviços."
            )

            self.update_session_state('inicio', {})
            await self.handle_inicio()

        except Exception as e:
            logger.error(f"Erro ao criar cliente: {e}")
            self.db.rollback()
            await self.send_message(
                "❌ Ocorreu um erro ao realizar seu cadastro. Por favor, tente novamente mais tarde."
            )
            self.update_session_state('inicio', {})

    async def handle_menu_cliente_existente(self):
        """Processa opções do menu de cliente existente."""
        if self.message_content == 'btn_suporte':
            await self.send_message("Por favor, descreva seu problema ou dúvida:")
            self.update_session_state('suporte_tecnico')

        elif self.message_content == 'btn_contratacoes':
            cliente_id = self.session.dados_temporarios.get('cliente_id')
            contratacoes = self.db.query(Contratacao).filter(
                Contratacao.cliente_id == cliente_id
            ).order_by(Contratacao.data_contratacao.desc()).limit(5).all()

            if contratacoes:
                mensagem = "📋 *Suas Contratações:*\n\n"
                for c in contratacoes:
                    status_emoji = "✅" if c.status_pagamento == 'pago' else "⏳"
                    mensagem += f"{status_emoji} {c.tipo_servico.descricao}\n"
                    mensagem += f"   Data: {c.data_contratacao.strftime('%d/%m/%Y')}\n"
                    mensagem += f"   Status: {c.status_pagamento.capitalize()}\n\n"

                await self.send_message(mensagem)

            await self.send_buttons(
                body_text="O que deseja fazer?",
                buttons=[
                    {"id": "btn_nova_contratacao", "title": "Nova Contratação"},
                    {"id": "btn_voltar", "title": "Voltar"}
                ]
            )
            self.update_session_state('menu_cliente_existente')

        elif self.message_content == 'btn_nova_contratacao':
            # Vai direto pra escolha de categoria
            await self.send_buttons(
                body_text="Escolha a categoria do serviço:",
                buttons=[
                    {"id": "btn_casas", "title": "Casas"},
                    {"id": "btn_apartamentos", "title": "Apartamentos"}
                ],
                header="🏘️ Categorias"
            )
            self.update_session_state('escolhendo_categoria_servico')

        else:
            await self.send_message("Por favor, use os botões para selecionar uma opção.")

    async def handle_suporte_tecnico(self):
        """Registra chamado de suporte."""
        cliente_id = self.session.dados_temporarios.get('cliente_id')

        reclamacao = Reclamacao(
            cliente_id=cliente_id,
            mensagem=self.message_content
        )
        self.db.add(reclamacao)
        self.db.commit()

        await self.send_message(
            "✅ Sua solicitação foi registrada com sucesso!\n\n"
            "Nossa equipe entrará em contato em breve."
        )
        self.update_session_state('inicio', {})
        await self.handle_inicio()

    async def handle_contratar_novo_servico(self):
        """Pergunta se quer contratar novo serviço."""
        if self.message_content == 'btn_sim_contratar':
            await self.send_buttons(
                body_text="Escolha a categoria do serviço:",
                buttons=[
                    {"id": "btn_casas", "title": "Casas"},
                    {"id": "btn_apartamentos", "title": "Apartamentos"}
                ],
                header="🏘️ Categorias"
            )
            self.update_session_state('escolhendo_categoria_servico')

        elif self.message_content == 'btn_nao_contratar':
            await self.send_message("Tudo bem! Se precisar de algo, estou aqui. 😊")
            self.update_session_state('inicio', {})

        else:
            await self.send_message("Por favor, use os botões para selecionar uma opção.")

    async def handle_escolhendo_categoria_servico(self):
        """Mostra lista de serviços da categoria."""
        categoria = None

        if self.message_content == 'btn_casas':
            categoria = 'casa'
        elif self.message_content == 'btn_apartamentos':
            categoria = 'apartamento'
        else:
            await self.send_message("Por favor, escolha uma das categorias disponíveis.")
            return

        servicos = self.db.query(TipoServico).filter(
            TipoServico.empresa_id == self.empresa.id,
            TipoServico.categoria == categoria
        ).all()

        if not servicos:
            await self.send_message("No momento não temos serviços disponíveis nesta categoria.")
            self.update_session_state('inicio')
            return

        # Monta lista de serviços
        rows = []
        for servico in servicos:
            rows.append({
                "id": f"servico_{servico.id}",
                "title": servico.descricao,
                "description": f"R$ {float(servico.preco):.2f}"
            })

        sections = [
            {
                "title": f"Serviços de {categoria.capitalize()}s",
                "rows": rows
            }
        ]

        await self.send_list(
            body_text="Escolha o serviço desejado:",
            button_text="Ver Serviços",
            sections=sections,
            header="📋 Serviços Disponíveis"
        )

        self.update_session_state('escolhendo_servico', {'categoria_servico': categoria})

    async def handle_escolhendo_servico(self):
        """Processa escolha do serviço."""
        if not self.message_content.startswith('servico_'):
            await self.send_message("Por favor, selecione um serviço da lista.")
            return

        servico_id = int(self.message_content.replace('servico_', ''))

        servico = self.db.query(TipoServico).filter(
            TipoServico.id == servico_id,
            TipoServico.empresa_id == self.empresa.id
        ).first()

        if not servico:
            await self.send_message("Serviço não encontrado. Por favor, tente novamente.")
            self.update_session_state('inicio')
            return

        self.update_session_state('informando_endereco_servico', {'servico_id': servico.id})

        await self.send_message(
            f"Você selecionou: *{servico.descricao}*\n"
            f"Valor: R$ {float(servico.preco):.2f}\n\n"
            f"Informe o endereço onde o serviço será realizado:"
        )

    async def handle_informando_endereco_servico(self):
        """Recebe endereço e mostra datas disponíveis."""
        endereco = self.message_content.strip()

        if len(endereco) < 10:
            await self.send_message("Por favor, informe um endereço completo:")
            return

        self.update_session_state('agendando_servico', {'endereco_servico': endereco})

        # Busca vagas disponíveis
        vagas = self.db.query(VagaAgenda).filter(
            VagaAgenda.empresa_id == self.empresa.id,
            VagaAgenda.quantidade_vagas > 0,
            VagaAgenda.data >= date.today()
        ).order_by(VagaAgenda.data).limit(10).all()

        if not vagas:
            await self.send_message(
                "❌ No momento não há datas disponíveis para agendamento.\n\n"
                "Por favor, entre em contato mais tarde."
            )
            self.update_session_state('inicio', {})
            return

        # Monta lista de datas
        rows = []
        for vaga in vagas:
            rows.append({
                "id": f"vaga_{vaga.id}",
                "title": vaga.data.strftime('%d/%m/%Y'),
                "description": f"{vaga.quantidade_vagas} vagas disponíveis"
            })

        sections = [
            {
                "title": "Datas Disponíveis",
                "rows": rows
            }
        ]

        await self.send_list(
            body_text="Escolha a data para o agendamento:",
            button_text="Ver Datas",
            sections=sections,
            header="📅 Agendamento"
        )

    async def handle_agendando_servico(self):
        """Cria contratação e agendamento."""
        if not self.message_content.startswith('vaga_'):
            await self.send_message("Por favor, selecione uma data da lista.")
            return

        vaga_id = int(self.message_content.replace('vaga_', ''))

        vaga = self.db.query(VagaAgenda).filter(
            VagaAgenda.id == vaga_id,
            VagaAgenda.empresa_id == self.empresa.id,
            VagaAgenda.quantidade_vagas > 0
        ).first()

        if not vaga:
            await self.send_message("❌ Essa data não está mais disponível. Por favor, escolha outra.")
            return

        try:
            cliente_id = self.session.dados_temporarios.get('cliente_id')
            servico_id = self.session.dados_temporarios.get('servico_id')
            endereco = self.session.dados_temporarios.get('endereco_servico')

            cliente = self.db.query(Cliente).get(cliente_id)
            servico = self.db.query(TipoServico).get(servico_id)

            # Cria contratação
            contratacao = Contratacao(
                cliente_id=cliente_id,
                tipo_servico_id=servico_id,
                endereco_servico=endereco
            )
            self.db.add(contratacao)
            self.db.flush()

            # Cria agendamento
            agendamento = Agendamento(
                contratacao_id=contratacao.id,
                data_agendada_id=vaga.id
            )
            self.db.add(agendamento)

            # Decrementa vaga
            vaga.quantidade_vagas -= 1
            self.db.commit()

            self.update_session_state('pagamento', {'contratacao_id': contratacao.id})

            await self.send_message(
                f"✅ Agendamento realizado com sucesso!\n\n"
                f"📋 Serviço: {servico.descricao}\n"
                f"📅 Data: {vaga.data.strftime('%d/%m/%Y')}\n"
                f"📍 Local: {endereco}\n"
                f"💰 Valor: R$ {float(servico.preco):.2f}\n\n"
                f"Agora vamos para o pagamento..."
            )

            # Opções de pagamento
            await self.send_buttons(
                body_text="Escolha a forma de pagamento:",
                buttons=[
                    {"id": "btn_pix", "title": "PIX"},
                    {"id": "btn_cartao", "title": "Cartão"}
                ],
                header="💳 Pagamento"
            )

        except Exception as e:
            logger.error(f"Erro ao criar agendamento: {e}")
            self.db.rollback()
            await self.send_message("❌ Erro ao processar agendamento. Tente novamente.")
            self.update_session_state('inicio', {})

    async def handle_pagamento(self):
        """Processa pagamento (integração Mercado Pago)."""
        contratacao_id = self.session.dados_temporarios.get('contratacao_id')
        contratacao = self.db.query(Contratacao).get(contratacao_id)

        if self.message_content in ['btn_pix', 'btn_cartao']:
            forma_pagamento = 'PIX' if self.message_content == 'btn_pix' else 'Cartão'

            # Se empresa tem Mercado Pago configurado
            if self.empresa.mercadopago_access_token:
                from app.services.mercadopago import gerar_pix, gerar_link_pagamento_cartao

                try:
                    if forma_pagamento == 'PIX':
                        resultado = await gerar_pix(self.empresa, contratacao)
                        if resultado:
                            await self.send_message(
                                f"💳 PIX gerado com sucesso!\n\n"
                                f"Código PIX (copie e cole):\n{resultado['qr_code']}\n\n"
                                f"Após o pagamento, seu agendamento estará confirmado!"
                            )
                        else:
                            await self.send_message("❌ Erro ao gerar PIX. Por favor, tente novamente.")
                    else:
                        link = await gerar_link_pagamento_cartao(self.empresa, contratacao, self.from_number)
                        if link:
                            await self.send_message(
                                f"💳 Link de pagamento gerado!\n\n"
                                f"Acesse o link abaixo para pagar com cartão:\n{link}\n\n"
                                f"Após a confirmação, seu agendamento estará confirmado!"
                            )
                        else:
                            await self.send_message("❌ Erro ao gerar link de pagamento. Por favor, tente novamente.")

                except Exception as e:
                    logger.error(f"Erro ao processar pagamento: {e}")
                    await self.send_message("❌ Erro ao processar pagamento. Por favor, entre em contato conosco.")

            else:
                # Sem Mercado Pago configurado
                await self.send_message(
                    f"💳 Forma de pagamento: {forma_pagamento}\n\n"
                    f"Por favor, entre em contato conosco para finalizar o pagamento.\n\n"
                    f"Telefone: {self.empresa.telefone or 'Aguarde contato'}"
                )

            contratacao.status_pagamento = 'pendente'
            self.db.commit()

            self.update_session_state('inicio', {})

        else:
            await self.send_message("Por favor, escolha uma forma de pagamento.")
