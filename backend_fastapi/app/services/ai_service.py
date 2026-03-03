"""
Serviço de IA usando Claude Haiku para análise de conversas CRM.
"""
import json
import logging
from typing import Optional
import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

ETAPAS_VALIDAS = [
    "novo_lead",
    "pediu_orcamento",
    "orcamento_enviado",
    "negociacao",
    "fechado",
    "perdido",
]

ETAPAS_DESCRICAO = {
    "novo_lead": "Lead novo, ainda sem contato qualificado",
    "pediu_orcamento": "Cliente pediu orçamento ou demonstrou interesse concreto",
    "orcamento_enviado": "Orçamento já foi enviado ao cliente",
    "negociacao": "Em negociação ativa de preço, condições ou prazo",
    "fechado": "Venda fechada / serviço contratado",
    "perdido": "Cliente desistiu, não respondeu ou escolheu concorrente",
}


def _formatar_mensagens(mensagens: list) -> str:
    """Formata lista de mensagens para texto legível pelo modelo."""
    linhas = []
    for m in mensagens:
        direcao = "Cliente" if m.direcao == "recebida" else "Atendente"
        conteudo = m.conteudo or ""
        # Limitar conteúdo longo
        if len(conteudo) > 500:
            conteudo = conteudo[:500] + "..."
        linhas.append(f"[{direcao}]: {conteudo}")
    return "\n".join(linhas)


async def analisar_conversa(mensagens: list, nome_cliente: str) -> dict:
    """
    Analisa a conversa com Claude Haiku e retorna:
    - resumo_conversa: resumo objetivo do que foi conversado
    - funil_etapa: etapa sugerida no funil de vendas
    - preferencias: preferências e necessidades detectadas
    - observacoes_crm: notas internas úteis para o time
    - valor_estimado: valor estimado da venda (se detectado, senão None)
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY não configurada.")

    if not mensagens:
        raise ValueError("Nenhuma mensagem encontrada para este lead.")

    conversa_texto = _formatar_mensagens(mensagens)

    etapas_lista = "\n".join(
        f'  - "{k}": {v}' for k, v in ETAPAS_DESCRICAO.items()
    )

    prompt = f"""Você é um assistente de CRM especializado em vendas. Analise a conversa abaixo entre um cliente e um atendente, e retorne uma análise estruturada em JSON.

Nome do cliente: {nome_cliente}

Conversa:
{conversa_texto}

Responda APENAS com um JSON válido, sem markdown, sem explicações. Use o seguinte formato:
{{
  "resumo_conversa": "resumo objetivo em 2-3 frases do que foi discutido",
  "funil_etapa": "uma das etapas abaixo",
  "preferencias": "principais preferências, necessidades ou interesses detectados",
  "observacoes_crm": "notas internas relevantes: urgência, objeções, próximos passos sugeridos",
  "valor_estimado": null
}}

Etapas disponíveis para funil_etapa:
{etapas_lista}

Regras:
- funil_etapa deve ser EXATAMENTE um dos valores listados acima
- valor_estimado deve ser um número (ex: 1500.00) se mencionado na conversa, senão null
- Escreva tudo em português brasileiro
- Seja objetivo e prático nas observações"""

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )

    texto = response.content[0].text.strip()

    # Remove possível markdown code block
    if texto.startswith("```"):
        linhas = texto.split("\n")
        texto = "\n".join(linhas[1:-1]) if linhas[-1] == "```" else "\n".join(linhas[1:])

    resultado = json.loads(texto)

    # Validar etapa
    if resultado.get("funil_etapa") not in ETAPAS_VALIDAS:
        resultado["funil_etapa"] = "novo_lead"

    # Garantir campos obrigatórios
    resultado.setdefault("resumo_conversa", "")
    resultado.setdefault("preferencias", "")
    resultado.setdefault("observacoes_crm", "")
    resultado.setdefault("valor_estimado", None)

    logger.info(f"IA analisou conversa de {nome_cliente}: etapa={resultado['funil_etapa']}")
    return resultado
