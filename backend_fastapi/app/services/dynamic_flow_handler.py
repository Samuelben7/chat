"""
Motor de fluxo dinamico do bot - le BotFluxo/BotFluxoNo/BotFluxoOpcao do banco
e processa mensagens de forma dinamica (substitui o bot_handler hardcoded).

Tipos de no suportados:
  - mensagem: Envia texto simples e segue para proximo_no
  - botoes: Envia mensagem com botoes interativos
  - lista: Envia mensagem com lista interativa
  - coletar_dado: Aguarda input do usuario e salva em dados_temporarios
  - condicional: Avalia condicao e segue para caminho true/false
  - transferir_atendente: Transfere para atendimento humano
  - delay: Aguarda X segundos antes de continuar
  - webhook_externo: Faz chamada HTTP externa e segue
  - gerar_pagamento: Gera PIX via Mercado Pago e envia no chat
"""
import asyncio
import logging
import re
from typing import Optional, Dict
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.models.models import (
    Empresa,
    BotFluxo,
    BotFluxoNo,
    BotFluxoOpcao,
    ChatSessao,
    MensagemLog,
    Atendimento,
    Cliente,
)
from app.services.whatsapp import WhatsAppService

logger = logging.getLogger(__name__)


class DynamicFlowHandler:
    """
    Processa mensagens usando fluxo dinamico definido no BotBuilder.
    Estado armazenado em ChatSessao.estado_atual como "fluxo:<identificador>"
    e dados coletados em ChatSessao.dados_temporarios.
    """

    PREFIX = "fluxo:"

    def __init__(
        self,
        empresa: Empresa,
        fluxo: BotFluxo,
        from_number: str,
        message_content: str,
        message_id: Optional[str],
        session: ChatSessao,
        db: Session,
    ):
        self.empresa = empresa
        self.fluxo = fluxo
        self.from_number = from_number
        self.message_content = message_content
        self.message_id = message_id
        self.session = session
        self.db = db
        self.whatsapp = WhatsAppService(empresa)

        # Cache de nos por identificador
        self._nodes_cache: Dict[str, BotFluxoNo] = {}
        self._nodes_by_id: Dict[int, BotFluxoNo] = {}
        self._load_nodes()

    def _load_nodes(self):
        """Carrega todos os nos do fluxo para cache em memoria."""
        nos = (
            self.db.query(BotFluxoNo)
            .filter(BotFluxoNo.fluxo_id == self.fluxo.id)
            .order_by(BotFluxoNo.ordem)
            .all()
        )
        for no in nos:
            self._nodes_cache[no.identificador] = no
            self._nodes_by_id[no.id] = no

    def _get_node_by_identifier(self, identificador: str) -> Optional[BotFluxoNo]:
        return self._nodes_cache.get(identificador)

    def _get_node_by_id(self, node_id: int) -> Optional[BotFluxoNo]:
        return self._nodes_by_id.get(node_id)

    def _get_start_node(self) -> Optional[BotFluxoNo]:
        """Retorna o primeiro no do fluxo (ordem=0 ou identificador 'inicio')."""
        if "inicio" in self._nodes_cache:
            return self._nodes_cache["inicio"]
        # Fallback: no com menor ordem
        if self._nodes_cache:
            return min(self._nodes_cache.values(), key=lambda n: n.ordem)
        return None

    def _get_current_node_identifier(self) -> Optional[str]:
        """Extrai identificador do no atual a partir do estado da sessao."""
        estado = self.session.estado_atual or ""
        if estado.startswith(self.PREFIX):
            return estado[len(self.PREFIX):]
        return None

    def _update_state(self, node_identifier: str, extra_data: dict = None):
        """Atualiza estado da sessao."""
        self.session.estado_atual = f"{self.PREFIX}{node_identifier}"
        if extra_data is not None:
            temp = dict(self.session.dados_temporarios or {})
            temp.update(extra_data)
            self.session.dados_temporarios = temp
        self.db.commit()

    def _reset_state(self):
        """Reseta sessao para o inicio."""
        self.session.estado_atual = "inicio"
        self.session.dados_temporarios = {}
        self.db.commit()

    def _interpolate_text(self, text: str) -> str:
        """Substitui variaveis {{var}} no texto com dados da sessao."""
        if not text:
            return text
        dados = self.session.dados_temporarios or {}

        def replacer(match):
            var_name = match.group(1)
            # Tentar dados_temporarios
            if var_name in dados:
                return str(dados[var_name])
            # Variaveis especiais
            if var_name == "nome_empresa":
                return self.empresa.nome
            if var_name == "numero_cliente":
                return self.from_number
            if var_name == "nome_cliente":
                cliente = self.db.query(Cliente).filter(
                    Cliente.empresa_id == self.empresa.id,
                    Cliente.whatsapp_number == self.from_number,
                ).first()
                if cliente:
                    return cliente.nome_completo.split()[0]
                return "Cliente"
            return match.group(0)  # Manter original se nao encontrar

        return re.sub(r'\{\{(\w+)\}\}', replacer, text)

    # ==================== LOGGING ====================

    def _log_received(self):
        """Registra mensagem recebida."""
        msg = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=self.from_number,
            message_id=self.message_id,
            direcao="recebida",
            tipo_mensagem="text",
            conteudo=self.message_content,
            dados_extras={},
            estado_sessao=self.session.estado_atual,
        )
        self.db.add(msg)
        self.db.commit()

    def _log_sent(self, conteudo: str, tipo: str = "text", dados_extras: dict = None, erro: str = None):
        """Registra mensagem enviada."""
        msg = MensagemLog(
            empresa_id=self.empresa.id,
            whatsapp_number=self.from_number,
            direcao="enviada",
            tipo_mensagem=tipo,
            conteudo=conteudo,
            dados_extras=dados_extras or {},
            estado_sessao=self.session.estado_atual,
            erro=erro,
        )
        self.db.add(msg)
        self.db.commit()

    # ==================== ENVIO ====================

    async def _send_text(self, text: str) -> bool:
        text = self._interpolate_text(text)
        try:
            await self.whatsapp.send_text_message(self.from_number, text)
            self._log_sent(text, "text")
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar texto: {e}")
            self._log_sent(text, "text", erro=str(e))
            return False

    async def _send_buttons(self, body: str, buttons: list, header: str = None, footer: str = None) -> bool:
        body = self._interpolate_text(body)
        header = self._interpolate_text(header) if header else None
        try:
            await self.whatsapp.send_button_message(self.from_number, body, buttons, header, footer)
            self._log_sent(body, "button", dados_extras={"buttons": buttons, "header": header, "footer": footer})
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar botoes: {e}")
            self._log_sent(body, "button", erro=str(e))
            return False

    async def _send_list(self, body: str, button_text: str, sections: list, header: str = None, footer: str = None) -> bool:
        body = self._interpolate_text(body)
        header = self._interpolate_text(header) if header else None
        try:
            await self.whatsapp.send_list_message(self.from_number, body, button_text, sections, header, footer)
            self._log_sent(body, "list", dados_extras={"sections": sections, "button_text": button_text})
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar lista: {e}")
            self._log_sent(body, "list", erro=str(e))
            return False

    # ==================== PROCESSAMENTO PRINCIPAL ====================

    async def process_message(self):
        """Ponto de entrada: processa a mensagem recebida no contexto do fluxo dinamico."""
        self._log_received()

        # Marcar como lida
        if self.message_id:
            try:
                await self.whatsapp.mark_as_read(self.message_id)
            except:
                pass

        # Determinar no atual
        current_id = self._get_current_node_identifier()

        if not current_id:
            # Primeira interacao ou estado resetado - ir para no inicial
            start_node = self._get_start_node()
            if not start_node:
                logger.error(f"Fluxo {self.fluxo.id} nao tem nos!")
                await self._send_text("Desculpe, ocorreu um erro no sistema. Tente novamente mais tarde.")
                return
            await self._execute_node(start_node)
            return

        # Buscar no atual
        current_node = self._get_node_by_identifier(current_id)
        if not current_node:
            # No nao existe mais, resetar
            logger.warning(f"No '{current_id}' nao encontrado, resetando")
            start_node = self._get_start_node()
            if start_node:
                await self._execute_node(start_node)
            return

        # Processar resposta do usuario baseado no tipo do no atual
        await self._handle_user_response(current_node)

    async def _execute_node(self, node: BotFluxoNo):
        """Executa um no: envia a mensagem e configura o estado."""
        tipo = node.tipo

        if tipo == "mensagem":
            await self._execute_mensagem(node)
        elif tipo == "botoes":
            await self._execute_botoes(node)
        elif tipo == "lista":
            await self._execute_lista(node)
        elif tipo == "coletar_dado":
            await self._execute_coletar_dado(node)
        elif tipo == "condicional":
            await self._execute_condicional(node)
        elif tipo == "transferir_atendente":
            await self._execute_transferir(node)
        elif tipo == "delay":
            await self._execute_delay(node)
        elif tipo == "webhook_externo":
            await self._execute_webhook(node)
        elif tipo == "gerar_pagamento":
            await self._execute_gerar_pagamento(node)
        else:
            logger.warning(f"Tipo de no desconhecido: {tipo}")
            await self._send_text("Ocorreu um erro. Voltando ao inicio...")
            self._reset_state()

    async def _advance_to_next(self, node: BotFluxoNo, option_next_id: int = None):
        """Avanca para o proximo no (via opcao ou proximo_no_id)."""
        next_id = option_next_id or node.proximo_no_id
        if next_id:
            next_node = self._get_node_by_id(next_id)
            if next_node:
                await self._execute_node(next_node)
                return

        # Sem proximo no - fluxo terminou, resetar para inicio
        self._reset_state()

    # ==================== HANDLERS DE TIPO DE NO ====================

    async def _execute_mensagem(self, node: BotFluxoNo):
        """Envia mensagem de texto e avanca automaticamente."""
        if node.conteudo:
            await self._send_text(node.conteudo)
        # Mensagem simples: avanca automaticamente
        await self._advance_to_next(node)

    async def _execute_botoes(self, node: BotFluxoNo):
        """Envia mensagem com botoes e aguarda resposta."""
        opcoes = sorted(node.opcoes, key=lambda o: o.ordem)[:3]  # Max 3 botoes WhatsApp

        buttons = []
        for opcao in opcoes:
            buttons.append({
                "id": f"opt_{opcao.id}",
                "title": opcao.titulo[:20],  # Max 20 chars
            })

        if not buttons:
            # Sem botoes configurados, enviar como texto e avancar
            if node.conteudo:
                await self._send_text(node.conteudo)
            await self._advance_to_next(node)
            return

        dados_extras = node.dados_extras or {}
        header = dados_extras.get("header") or node.titulo
        footer = dados_extras.get("footer")

        await self._send_buttons(
            body=node.conteudo or "Escolha uma opcao:",
            buttons=buttons,
            header=header,
            footer=footer,
        )
        self._update_state(node.identificador)

    async def _execute_lista(self, node: BotFluxoNo):
        """Envia mensagem com lista e aguarda resposta."""
        opcoes = sorted(node.opcoes, key=lambda o: o.ordem)[:10]  # Max 10 items

        rows = []
        for opcao in opcoes:
            rows.append({
                "id": f"opt_{opcao.id}",
                "title": opcao.titulo[:24],  # Max 24 chars
                "description": (opcao.descricao or "")[:72],  # Max 72 chars
            })

        if not rows:
            if node.conteudo:
                await self._send_text(node.conteudo)
            await self._advance_to_next(node)
            return

        dados_extras = node.dados_extras or {}
        header = dados_extras.get("header") or node.titulo
        footer = dados_extras.get("footer")
        button_text = dados_extras.get("button_text", "Ver opcoes")

        sections = [{"title": header or "Opcoes", "rows": rows}]

        await self._send_list(
            body=node.conteudo or "Selecione uma opcao:",
            button_text=button_text,
            sections=sections,
            header=header,
            footer=footer,
        )
        self._update_state(node.identificador)

    async def _execute_coletar_dado(self, node: BotFluxoNo):
        """Envia pergunta e aguarda input do usuario."""
        if node.conteudo:
            await self._send_text(node.conteudo)
        self._update_state(node.identificador)

    async def _execute_condicional(self, node: BotFluxoNo):
        """Avalia condicao e segue para caminho verdadeiro ou falso."""
        dados_extras = node.dados_extras or {}
        condicao = dados_extras.get("condicao", "")
        dados = self.session.dados_temporarios or {}

        resultado = self._evaluate_condition(condicao, dados)

        # Opcoes: primeira = true, segunda = false
        opcoes = sorted(node.opcoes, key=lambda o: o.ordem)
        if resultado and len(opcoes) >= 1 and opcoes[0].proximo_no_id:
            await self._advance_to_next(node, opcoes[0].proximo_no_id)
        elif not resultado and len(opcoes) >= 2 and opcoes[1].proximo_no_id:
            await self._advance_to_next(node, opcoes[1].proximo_no_id)
        else:
            # Sem caminho configurado, avancar normalmente
            await self._advance_to_next(node)

    async def _execute_transferir(self, node: BotFluxoNo):
        """Transfere para atendimento humano."""
        if node.conteudo:
            await self._send_text(node.conteudo)
        else:
            await self._send_text(
                "Vou transferir voce para um de nossos atendentes. "
                "Aguarde um momento, por favor."
            )

        # Atualizar atendimento para aguardando
        atendimento = (
            self.db.query(Atendimento)
            .filter(
                Atendimento.whatsapp_number == self.from_number,
                Atendimento.status.in_(["bot", "aguardando"]),
            )
            .order_by(Atendimento.iniciado_em.desc())
            .first()
        )
        if atendimento:
            atendimento.status = "aguardando"
        else:
            atendimento = Atendimento(
                whatsapp_number=self.from_number,
                status="aguardando",
            )
            self.db.add(atendimento)
        self.db.commit()

        # Resetar estado do bot (nao processar mais mensagens)
        self._reset_state()

    async def _execute_delay(self, node: BotFluxoNo):
        """Aguarda X segundos e avanca."""
        dados_extras = node.dados_extras or {}
        duracao = int(dados_extras.get("duracao", 1))
        unidade = dados_extras.get("unidade", "segundos")

        if unidade == "minutos":
            duracao *= 60
        elif unidade == "horas":
            duracao *= 3600

        # Limitar delay a 30 segundos (prevenir abuso)
        duracao = min(duracao, 30)

        if duracao > 0:
            await asyncio.sleep(duracao)

        await self._advance_to_next(node)

    async def _execute_webhook(self, node: BotFluxoNo):
        """Faz chamada HTTP externa e avanca."""
        dados_extras = node.dados_extras or {}
        url = dados_extras.get("url", "")
        method = dados_extras.get("method", "POST").upper()

        if not url:
            logger.warning(f"Webhook node {node.identificador} sem URL configurada")
            await self._advance_to_next(node)
            return

        dados = self.session.dados_temporarios or {}
        payload = {
            "whatsapp_number": self.from_number,
            "empresa_id": self.empresa.id,
            "dados_coletados": dados,
            "message_content": self.message_content,
        }

        try:
            async with httpx.AsyncClient() as client:
                if method == "GET":
                    resp = await client.get(url, params=payload, timeout=10.0)
                else:
                    resp = await client.post(url, json=payload, timeout=10.0)

                if resp.status_code == 200:
                    resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                    # Salvar resposta em dados_temporarios
                    self._update_state(node.identificador, {"webhook_response": resp_data})
                else:
                    logger.warning(f"Webhook retornou status {resp.status_code}")

        except Exception as e:
            logger.error(f"Erro ao chamar webhook {url}: {e}")

        await self._advance_to_next(node)

    async def _execute_gerar_pagamento(self, node: BotFluxoNo):
        """Gera pagamento PIX via Mercado Pago e envia no chat."""
        dados_extras = node.dados_extras or {}
        valor = dados_extras.get("valor")
        descricao = dados_extras.get("descricao", "Pagamento via bot")

        if not self.empresa.mercadopago_access_token:
            await self._send_text(
                "Desculpe, o pagamento online nao esta disponivel no momento. "
                "Entre em contato conosco para mais informacoes."
            )
            await self._advance_to_next(node)
            return

        if not valor:
            await self._send_text("Erro na configuracao do pagamento. Tente novamente mais tarde.")
            await self._advance_to_next(node)
            return

        try:
            from app.services.mercadopago import MercadoPagoService

            # Buscar dados do cliente
            cliente = self.db.query(Cliente).filter(
                Cliente.empresa_id == self.empresa.id,
                Cliente.whatsapp_number == self.from_number,
            ).first()

            mp_service = MercadoPagoService(self.empresa)

            # Gerar PIX direto (sem contratacao)
            payment_data = {
                "transaction_amount": float(valor),
                "description": self._interpolate_text(descricao),
                "payment_method_id": "pix",
                "external_reference": f"bot_fluxo_{self.fluxo.id}_{self.from_number}_{int(datetime.now().timestamp())}",
                "payer": {
                    "email": f"{self.from_number}@whatsapp.temp",
                    "first_name": cliente.nome_completo.split()[0] if cliente else "Cliente",
                    "last_name": (
                        " ".join(cliente.nome_completo.split()[1:])
                        if cliente and len(cliente.nome_completo.split()) > 1
                        else "Bot"
                    ),
                    "identification": {
                        "type": "CPF",
                        "number": cliente.cpf.replace(".", "").replace("-", "") if cliente and cliente.cpf else "00000000000",
                    },
                },
            }

            async with httpx.AsyncClient() as http_client:
                response = await http_client.post(
                    f"{mp_service.base_url}/v1/payments",
                    headers=mp_service.headers,
                    json=payment_data,
                    timeout=30.0,
                )
                response.raise_for_status()
                payment = response.json()

            qr_code = payment["point_of_interaction"]["transaction_data"]["qr_code"]
            payment_id = payment["id"]

            await self._send_text(
                f"Pagamento PIX gerado com sucesso!\n\n"
                f"Valor: R$ {float(valor):.2f}\n"
                f"Descricao: {self._interpolate_text(descricao)}\n\n"
                f"Codigo PIX (copie e cole):\n{qr_code}\n\n"
                f"Apos o pagamento ser confirmado, voce recebera uma notificacao."
            )

            # Salvar payment_id nos dados temporarios
            self._update_state(node.identificador, {
                "payment_id": str(payment_id),
                "payment_status": "pending",
            })

        except Exception as e:
            logger.error(f"Erro ao gerar pagamento PIX: {e}")
            await self._send_text(
                "Desculpe, houve um erro ao gerar o pagamento. "
                "Por favor, tente novamente ou entre em contato conosco."
            )

        await self._advance_to_next(node)

    # ==================== HANDLER DE RESPOSTA DO USUARIO ====================

    async def _handle_user_response(self, current_node: BotFluxoNo):
        """Processa resposta do usuario baseado no tipo do no atual."""
        tipo = current_node.tipo

        if tipo == "botoes":
            await self._handle_button_response(current_node)
        elif tipo == "lista":
            await self._handle_list_response(current_node)
        elif tipo == "coletar_dado":
            await self._handle_collect_response(current_node)
        else:
            # Para outros tipos (mensagem, transferir, etc.), a resposta
            # nao era esperada - reexecutar o no
            await self._execute_node(current_node)

    async def _handle_button_response(self, node: BotFluxoNo):
        """Processa resposta de botao."""
        content = self.message_content

        # Buscar opcao correspondente
        for opcao in node.opcoes:
            if content == f"opt_{opcao.id}" or content == opcao.valor or content.lower() == opcao.titulo.lower():
                if opcao.proximo_no_id:
                    await self._advance_to_next(node, opcao.proximo_no_id)
                else:
                    await self._advance_to_next(node)
                return

        # Resposta nao reconhecida
        await self._send_text("Desculpe, nao entendi. Por favor, use os botoes para responder.")
        # Reenviar botoes
        await self._execute_botoes(node)

    async def _handle_list_response(self, node: BotFluxoNo):
        """Processa resposta de lista."""
        content = self.message_content

        for opcao in node.opcoes:
            if content == f"opt_{opcao.id}" or content == opcao.valor or content.lower() == opcao.titulo.lower():
                if opcao.proximo_no_id:
                    await self._advance_to_next(node, opcao.proximo_no_id)
                else:
                    await self._advance_to_next(node)
                return

        await self._send_text("Desculpe, nao entendi. Por favor, selecione uma opcao da lista.")
        await self._execute_lista(node)

    async def _handle_collect_response(self, node: BotFluxoNo):
        """Processa dado coletado do usuario e salva no Cliente (banco de dados)."""
        dados_extras = node.dados_extras or {}
        variavel = dados_extras.get("variavel", "")

        # Se variavel nao esta na lista de dados coletaveis, rejeitar
        if variavel not in self.DADOS_COLETAVEIS:
            logger.warning(f"Variavel '{variavel}' nao esta nos dados coletaveis fixos")
            await self._send_text("Erro de configuracao. Entrando em contato com suporte...")
            await self._advance_to_next(node)
            return

        valor = self.message_content.strip()

        # Usar validacao definida no DADOS_COLETAVEIS (ignora config manual)
        validacao = self.DADOS_COLETAVEIS[variavel]["validacao"]
        if validacao and validacao != "texto":
            is_valid, error_msg = self._validate_input(valor, validacao)
            if not is_valid:
                await self._send_text(error_msg)
                return

        # Salvar dado na sessao
        self._update_state(node.identificador, {variavel: valor})

        # ========== SALVAR NO CLIENTE (BANCO DE DADOS) ==========
        self._persist_to_cliente(variavel, valor)

        # Avancar
        await self._advance_to_next(node)

    # ==================== DADOS COLETAVEIS (FIXOS) ====================
    # Unico lugar que define quais dados podem ser coletados e onde salvar.
    # O frontend usa a mesma lista (espelhada em BotBuilder.tsx).
    DADOS_COLETAVEIS = {
        "nome_completo":        {"campo": "nome_completo",        "label": "Nome Completo",        "validacao": "nao_vazio"},
        "cpf":                  {"campo": "cpf",                  "label": "CPF",                  "validacao": "cpf"},
        "rg":                   {"campo": "rg",                   "label": "RG",                   "validacao": "nao_vazio"},
        "email":                {"campo": "email",                "label": "E-mail",               "validacao": "email"},
        "data_nascimento":      {"campo": "data_nascimento",      "label": "Data de Nascimento",   "validacao": "data"},
        "telefone_secundario":  {"campo": "telefone_secundario",  "label": "Telefone Secundario",  "validacao": "telefone"},
        "endereco":             {"campo": "endereco_residencial", "label": "Endereco (Rua/Numero)","validacao": "nao_vazio"},
        "complemento":          {"campo": "complemento",          "label": "Complemento",          "validacao": "texto"},
        "bairro":               {"campo": "bairro",               "label": "Bairro",               "validacao": "nao_vazio"},
        "cidade":               {"campo": "cidade",               "label": "Cidade",               "validacao": "nao_vazio"},
        "estado":               {"campo": "estado",               "label": "Estado (UF)",          "validacao": "nao_vazio"},
        "pais":                 {"campo": "pais",                 "label": "Pais",                 "validacao": "nao_vazio"},
        "cep":                  {"campo": "cep",                  "label": "CEP",                  "validacao": "cep"},
        "chave_pix":            {"campo": "chave_pix",            "label": "Chave PIX",            "validacao": "nao_vazio"},
        "profissao":            {"campo": "profissao",            "label": "Profissao",            "validacao": "texto"},
        "empresa_cliente":      {"campo": "empresa_cliente",      "label": "Nome da Empresa",      "validacao": "texto"},
    }

    def _persist_to_cliente(self, variavel: str, valor: str):
        """Salva dado coletado diretamente no registro do Cliente no banco."""
        config = self.DADOS_COLETAVEIS.get(variavel)
        if not config:
            logger.warning(f"Variavel '{variavel}' nao esta na lista de dados coletaveis - ignorando")
            return

        campo_db = config["campo"]

        try:
            cliente = self.db.query(Cliente).filter(
                Cliente.empresa_id == self.empresa.id,
                Cliente.whatsapp_number == self.from_number,
            ).first()

            if cliente:
                # Formatar CPF se necessario
                if campo_db == "cpf" and valor:
                    try:
                        from app.services.validators import formatar_cpf
                        valor = formatar_cpf(valor)
                    except:
                        pass

                # Data de nascimento: converter string para date
                if campo_db == "data_nascimento" and valor:
                    try:
                        from datetime import datetime as dt
                        # Aceita dd/mm/aaaa ou dd-mm-aaaa
                        valor_limpo = valor.replace("-", "/")
                        parsed = dt.strptime(valor_limpo, "%d/%m/%Y").date()
                        setattr(cliente, campo_db, parsed)
                    except:
                        setattr(cliente, campo_db, None)
                        logger.warning(f"Data invalida: {valor}")
                else:
                    setattr(cliente, campo_db, valor)

                self.db.commit()
                logger.info(f"Cliente {self.from_number} atualizado: {campo_db} = {valor[:20]}...")
            else:
                # Criar cliente se nao existe (raro, pois o webhook ja cria)
                new_data = {
                    "empresa_id": self.empresa.id,
                    "whatsapp_number": self.from_number,
                    "nome_completo": valor if campo_db == "nome_completo" else f"Contato {self.from_number[-4:]}",
                }
                if campo_db != "nome_completo":
                    if campo_db == "data_nascimento":
                        try:
                            from datetime import datetime as dt
                            valor_limpo = valor.replace("-", "/")
                            new_data[campo_db] = dt.strptime(valor_limpo, "%d/%m/%Y").date()
                        except:
                            pass
                    else:
                        new_data[campo_db] = valor

                cliente = Cliente(**new_data)
                self.db.add(cliente)
                self.db.commit()
                logger.info(f"Novo Cliente criado via coletar_dado: {self.from_number}")

        except Exception as e:
            logger.error(f"Erro ao salvar dado no Cliente: {e}")
            self.db.rollback()

    # ==================== UTILIDADES ====================

    def _evaluate_condition(self, condicao: str, dados: dict) -> bool:
        """
        Avalia condicao simples.
        Formatos suportados:
          - "variavel == valor"
          - "variavel != valor"
          - "variavel exists"
          - "variavel contains valor"
        """
        if not condicao:
            return True

        condicao = condicao.strip()

        # "variavel exists"
        if " exists" in condicao:
            var_name = condicao.replace(" exists", "").strip()
            return var_name in dados and dados[var_name]

        # "variavel contains valor"
        if " contains " in condicao:
            parts = condicao.split(" contains ", 1)
            var_name = parts[0].strip()
            expected = parts[1].strip().strip('"').strip("'")
            return expected.lower() in str(dados.get(var_name, "")).lower()

        # "variavel == valor"
        if " == " in condicao:
            parts = condicao.split(" == ", 1)
            var_name = parts[0].strip()
            expected = parts[1].strip().strip('"').strip("'")
            return str(dados.get(var_name, "")).lower() == expected.lower()

        # "variavel != valor"
        if " != " in condicao:
            parts = condicao.split(" != ", 1)
            var_name = parts[0].strip()
            expected = parts[1].strip().strip('"').strip("'")
            return str(dados.get(var_name, "")).lower() != expected.lower()

        return True

    def _validate_input(self, valor: str, validacao: str) -> tuple:
        """Valida input do usuario. Retorna (is_valid, error_message)."""
        if validacao == "cpf":
            from app.services.validators import validar_cpf
            if not validar_cpf(valor):
                return False, "CPF invalido. Por favor, digite um CPF valido (apenas numeros):"
            return True, ""

        if validacao == "email":
            if "@" not in valor or "." not in valor:
                return False, "Email invalido. Por favor, digite um email valido:"
            return True, ""

        if validacao == "telefone":
            digits = re.sub(r'\D', '', valor)
            if len(digits) < 10 or len(digits) > 13:
                return False, "Telefone invalido. Informe um numero valido com DDD:"
            return True, ""

        if validacao == "numero":
            if not valor.replace(",", ".").replace(".", "", 1).isdigit():
                return False, "Por favor, digite apenas numeros:"
            return True, ""

        if validacao == "cep":
            digits = re.sub(r'\D', '', valor)
            if len(digits) != 8:
                return False, "CEP invalido. Informe um CEP com 8 digitos:"
            return True, ""

        if validacao == "data":
            # Aceita dd/mm/aaaa
            valor_limpo = valor.strip().replace("-", "/")
            try:
                from datetime import datetime as dt
                dt.strptime(valor_limpo, "%d/%m/%Y")
                return True, ""
            except:
                return False, "Data invalida. Use o formato DD/MM/AAAA (ex: 15/03/1990):"

        if validacao == "nao_vazio":
            if not valor.strip():
                return False, "Por favor, informe um valor:"
            return True, ""

        # "texto" - aceita qualquer coisa
        return True, ""


def get_active_flow(db: Session, empresa_id: int) -> Optional[BotFluxo]:
    """Busca o fluxo ativo da empresa (so pode ter 1 ativo)."""
    return (
        db.query(BotFluxo)
        .filter(
            BotFluxo.empresa_id == empresa_id,
            BotFluxo.ativo == True,
        )
        .first()
    )
