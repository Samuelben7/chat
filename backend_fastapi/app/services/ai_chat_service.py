"""
Serviço de IA conversacional usando Claude Haiku.
Responde mensagens de WhatsApp com contexto do negócio + histórico da conversa.
"""
import asyncio
import random
import logging
import re as _re_fmt
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo
import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

# Contexto-base de odontologia para demonstração (usado como fallback se ia_contexto vazio)
CONTEXTO_DEMO_ODONTOLOGIA = """
Você é uma assistente virtual de uma clínica odontológica.

PROCEDIMENTOS E VALORES:
- Consulta inicial / avaliação: R$ 100 – R$ 250
- Limpeza / profilaxia: R$ 150 – R$ 300
- Restauração (obturação) simples: R$ 150 – R$ 400
- Clareamento dental (consultório): R$ 600 – R$ 1.500
- Clareamento caseiro (moldeiras): R$ 400 – R$ 1.000
- Faceta de resina (por dente): R$ 300 – R$ 800
- Faceta de porcelana (por dente): R$ 1.200 – R$ 3.000+
- Lentes de contato dental (por dente): R$ 1.500 – R$ 3.500+
- Tratamento de canal (por dente): R$ 600 – R$ 1.500
- Extração simples: R$ 100 – R$ 400
- Extração de siso: R$ 400 – R$ 1.000
- Implante dentário (por unidade): R$ 2.500 – R$ 6.000+
- Aparelho fixo metálico: R$ 1.500 – R$ 4.000+
- Alinhadores invisíveis: R$ 5.000 – R$ 12.000+
- Prótese total (dentadura): R$ 1.000 – R$ 3.500+
- Placa miorrelaxante (bruxismo): R$ 400 – R$ 1.000
- Toxina botulínica (harmonização): R$ 800 – R$ 2.500
- Preenchimento com ácido hialurônico: R$ 1.200 – R$ 3.500

PARCELAMENTO: Procedimentos acima de R$ 500 podem ser parcelados em até 12x no cartão.

HORÁRIOS DE ATENDIMENTO:
- Segunda a Sexta: 8h às 18h
- Sábado: 8h às 12h

AGENDAMENTO: Para agendar, solicite nome completo, procedimento desejado e preferência de horário.
"""

def _converter_markdown_whatsapp(texto: str) -> str:
    """Converte markdown padrão para formatação nativa do WhatsApp."""
    # **negrito** → *negrito*
    texto = _re_fmt.sub(r'\*\*(.+?)\*\*', r'*\1*', texto)
    # __texto__ → _texto_ (já é itálico no WhatsApp)
    texto = _re_fmt.sub(r'__(.+?)__', r'_\1_', texto)
    # ## Título ou # Título → *Título*
    texto = _re_fmt.sub(r'^#{1,6}\s+(.+)$', r'*\1*', texto, flags=_re_fmt.MULTILINE)
    return texto


SYSTEM_PROMPT_BASE = """Você é {nome_assistente}, assistente virtual de atendimento pelo WhatsApp.

{contexto_negocio}

INSTRUÇÕES DE COMPORTAMENTO:
1. Seja calorosa, empática e profissional. Use linguagem simples e acessível.
2. Apresente-se pelo nome apenas na primeira mensagem da conversa.
3. Descubra a necessidade do cliente antes de oferecer procedimentos.
4. Use princípios de neurociência de forma sutil:
   - Reciprocidade: ofereça informação útil antes de vender
   - Prova social: mencione "procedimento mais procurado" ou "resultado excelente"
   - Escassez: "nossa agenda está bastante disputada esta semana"
   - Ancoragem: quando der valores, mencione o investimento maior primeiro, depois opções mais acessíveis
5. NUNCA pressione o cliente. Seja consultiva, não vendedora.
6. Quando o cliente demonstrar interesse em agendar, colete: nome, procedimento e horário preferido.
7. Mensagens curtas e objetivas. Máximo 3 parágrafos por resposta.
8. Use emojis com moderação (1-2 por mensagem, apenas quando natural).
9. Se não souber responder algo, diga que vai verificar com a equipe.
10. Responda SEMPRE em português brasileiro.
    FORMATAÇÃO (WhatsApp): use *negrito* para títulos e destaques, _itálico_ para ênfases sutis.
    NUNCA use markdown padrão como ## ou **. Para datas, escreva por extenso: "segunda-feira, 10/03 às 10:00".
11. Quando o objetivo da conversa estiver COMPLETAMENTE concluído (agendamento confirmado com nome/procedimento/horário, dúvida totalmente esclarecida, cliente se despede explicitamente), adicione exatamente este marcador no final da sua resposta: [CONVERSA_ENCERRADA]
    IMPORTANTE: Use esse marcador SOMENTE quando tiver certeza que o atendimento está finalizado. Não use em meio à conversa. Só uma vez, no final.
12. Quando confirmar um agendamento com data e hora específicos, adicione ANTES do [CONVERSA_ENCERRADA] o marcador: [AGENDAMENTO:AAAA-MM-DD|HH:MM]
    Exemplo: se agendou para 07 de março de 2026 às 10:00, escreva: [AGENDAMENTO:2026-03-07|10:00][CONVERSA_ENCERRADA]
    Use sempre o formato de ano com 4 dígitos, mês e dia com 2 dígitos, hora com 2 dígitos.
    NUNCA coloque esse marcador se o agendamento não foi confirmado com data e hora exatas.
13. Quando o cliente solicitar CANCELAMENTO de um agendamento:
    a) Consulte os agendamentos futuros dele listados no contexto da agenda.
    b) Se houver mais de um, pergunte qual ele deseja cancelar.
    c) Confirme os detalhes e peça confirmação: "Confirma o cancelamento do dia X às H?"
    d) Após confirmação explícita, adicione o marcador: [CANCELAR_AGENDAMENTO:ID] com o ID do agendamento.
    e) Não use esse marcador sem confirmação explícita do cliente.
    f) Informe que o horário será liberado para outros clientes.
"""


def _montar_historico(mensagens: list) -> list:
    """Converte mensagens do banco em formato Anthropic messages."""
    historico = []
    for m in mensagens[-20:]:  # últimas 20 mensagens para o contexto
        role = "user" if m.direcao == "recebida" else "assistant"
        conteudo = m.conteudo or ""
        if conteudo and conteudo.strip():
            historico.append({"role": role, "content": conteudo.strip()})

    # Garantir que começa com user (requisito da API)
    while historico and historico[0]["role"] != "user":
        historico.pop(0)

    # Garantir alternância user/assistant (mesclar consecutivos do mesmo role)
    normalizado = []
    for msg in historico:
        if normalizado and normalizado[-1]["role"] == msg["role"]:
            normalizado[-1]["content"] += "\n" + msg["content"]
        else:
            normalizado.append(msg)

    return normalizado


async def gerar_resposta_ia(
    mensagens: list,
    nova_mensagem: str,
    nome_assistente: str,
    contexto_negocio: Optional[str],
    delay_min: int = 7,
    delay_max: int = 10,
    crm_context: Optional[str] = None,
    agenda_context: Optional[str] = None,
    sistema_feedback: Optional[str] = None,
) -> str:
    """
    Gera resposta da IA para uma mensagem recebida.
    Aplica delay humano com distribuição gaussiana centrada na média configurada.

    Args:
        mensagens: histórico de MensagemLog do banco
        nova_mensagem: conteúdo da mensagem atual
        nome_assistente: nome do assistente configurado
        contexto_negocio: contexto/instruções do negócio
        delay_min: usado como MÉDIA do delay (segundos)
        delay_max: não usado diretamente (mantido para compatibilidade)
        crm_context: dados do lead (resumo, preferências, etapa) para personalizar respostas
    Returns:
        Texto da resposta gerada
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY não configurada.")

    contexto = contexto_negocio.strip() if contexto_negocio and contexto_negocio.strip() else CONTEXTO_DEMO_ODONTOLOGIA

    now_br = datetime.now(ZoneInfo('America/Sao_Paulo'))
    system_prompt = SYSTEM_PROMPT_BASE.format(
        nome_assistente=nome_assistente or "Assistente",
        contexto_negocio=contexto,
    )

    # Injetar data E hora atual (fuso Brasil) — evita agendar horários que já passaram
    system_prompt = (
        f"DATA E HORA ATUAL: {now_br.strftime('%d/%m/%Y %H:%M')} (fuso: Brasil/Brasília, ano {now_br.year}). "
        f"Horários passados NÃO podem ser agendados — se o cliente pedir um horário que já passou hoje, recuse gentilmente. "
        f"Ao usar o marcador [AGENDAMENTO:AAAA-MM-DD|HH:MM], o ano DEVE ser {now_br.year} ou posterior.\n\n"
    ) + system_prompt

    # Enriquecer com contexto CRM quando disponível
    if crm_context:
        system_prompt += (
            "\n\nCONTEXTO DO CLIENTE (histórico do CRM — use para personalizar sem repetir perguntas):\n"
            + crm_context
            + "\n\nCom base nesse contexto, personalize a conversa: não pergunte informações que o cliente já forneceu, "
            "e avance naturalmente no atendimento considerando a etapa atual do funil."
        )

    # Feedback interno do sistema (ex: slot ocupado por outro cliente)
    if sistema_feedback:
        system_prompt += (
            "\n\nFEEDBACK INTERNO DO SISTEMA (informação de bastidores — não mencione ao cliente diretamente, "
            "apenas aja com base nessa informação ao formular sua resposta):\n"
            + sistema_feedback
        )

    # Enriquecer com dados reais da agenda quando disponíveis
    if agenda_context:
        system_prompt += (
            "\n\nAGENDA REAL — HORÁRIOS DISPONÍVEIS (use esses dados para informar o cliente sobre disponibilidade):\n"
            + agenda_context
            + "\n\nIMPORTANTE sobre agendamentos:\n"
            "- Use SOMENTE os horários listados acima para sugerir ao cliente.\n"
            "- Se o horário desejado pelo cliente não estiver disponível, ofereça as alternativas mais próximas.\n"
            "- Quando o cliente confirmar nome + procedimento + horário específico disponível, "
            "confirme o agendamento e use o marcador [CONVERSA_ENCERRADA] ao final."
        )

    # Montar histórico sem a mensagem atual (será adicionada como último user)
    historico = _montar_historico(mensagens)

    # Se o último item já é a nova mensagem (mesmo conteúdo), não duplicar
    if historico and historico[-1]["role"] == "user" and historico[-1]["content"] == nova_mensagem:
        messages_final = historico
    else:
        # Adicionar nova mensagem do cliente
        if historico and historico[-1]["role"] == "user":
            historico[-1]["content"] += "\n" + nova_mensagem
            messages_final = historico
        else:
            messages_final = historico + [{"role": "user", "content": nova_mensagem}]

    # Delay com distribuição gaussiana — simula variação humana natural
    # delay_min é tratado como a MÉDIA; desvio padrão = 35% da média
    media = float(delay_min)
    desvio = media * 0.35
    delay = random.gauss(media, desvio)
    # Clipa: mínimo 1.5s, máximo 2.5× a média (evita delays extremos)
    delay = max(1.5, min(media * 2.5, delay))
    logger.info(f"⏱️  IA delay: {delay:.1f}s (média={media}s)")
    await asyncio.sleep(delay)

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system_prompt,
        messages=messages_final,
    )

    resposta = response.content[0].text.strip()
    # Converter markdown padrão para formatação nativa do WhatsApp
    resposta = _converter_markdown_whatsapp(resposta)
    logger.info(f"IA gerou resposta ({len(resposta)} chars) para '{nova_mensagem[:50]}'")
    return resposta
