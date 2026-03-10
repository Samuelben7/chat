"""
Cliente assíncrono para a API pública do DataJud (CNJ).
Documentação: https://datajud-wiki.cnj.jus.br/
"""
import hashlib
import httpx
import logging
import re
from datetime import datetime
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("datajud")

DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br"
DATAJUD_API_KEY = settings.DATAJUD_API_KEY or ""

# Mapeamento: código tribunal (J.TT no número CNJ) → índice DataJud
# J=8 → Estadual/TJ; J=4 → Federal/TRF; J=5 → Trabalhista/TRT; J=6 → Eleitoral; J=1 → STF; J=3 → STJ
TRIBUNAL_INDEX_MAP = {
    # Estaduais (J=8)
    "8.01": "api_publica_tjac",
    "8.02": "api_publica_tjal",
    "8.03": "api_publica_tjam",
    "8.04": "api_publica_tjap",
    "8.05": "api_publica_tjba",
    "8.06": "api_publica_tjce",
    "8.07": "api_publica_tjdf",
    "8.08": "api_publica_tjes",
    "8.09": "api_publica_tjgo",
    "8.10": "api_publica_tjma",
    "8.11": "api_publica_tjmt",
    "8.12": "api_publica_tjms",
    "8.13": "api_publica_tjmg",
    "8.14": "api_publica_tjpa",
    "8.15": "api_publica_tjpb",
    "8.16": "api_publica_tjpr",
    "8.17": "api_publica_tjpe",
    "8.18": "api_publica_tjpi",
    "8.19": "api_publica_tjrj",
    "8.20": "api_publica_tjrn",
    "8.21": "api_publica_tjrs",
    "8.22": "api_publica_tjro",
    "8.23": "api_publica_tjrr",
    "8.24": "api_publica_tjsc",
    "8.25": "api_publica_tjse",
    "8.26": "api_publica_tjsp",
    "8.27": "api_publica_tjto",
    # Federais / TRFs (J=4)
    "4.01": "api_publica_trf1",
    "4.02": "api_publica_trf2",
    "4.03": "api_publica_trf3",
    "4.04": "api_publica_trf4",
    "4.05": "api_publica_trf5",
    "4.06": "api_publica_trf6",
    # Trabalhistas / TRTs (J=5)
    "5.01": "api_publica_trt1",
    "5.02": "api_publica_trt2",
    "5.03": "api_publica_trt3",
    "5.04": "api_publica_trt4",
    "5.05": "api_publica_trt5",
    "5.06": "api_publica_trt6",
    "5.07": "api_publica_trt7",
    "5.08": "api_publica_trt8",
    "5.09": "api_publica_trt9",
    "5.10": "api_publica_trt10",
    "5.11": "api_publica_trt11",
    "5.12": "api_publica_trt12",
    "5.13": "api_publica_trt13",
    "5.14": "api_publica_trt14",
    "5.15": "api_publica_trt15",
    "5.16": "api_publica_trt16",
    "5.17": "api_publica_trt17",
    "5.18": "api_publica_trt18",
    "5.19": "api_publica_trt19",
    "5.20": "api_publica_trt20",
    "5.21": "api_publica_trt21",
    "5.22": "api_publica_trt22",
    "5.23": "api_publica_trt23",
    "5.24": "api_publica_trt24",
    # Superiores
    "1.00": "api_publica_stf",
    "3.00": "api_publica_stj",
    "6.00": "api_publica_tse",
    "9.00": "api_publica_stm",
    # TST (Trabalhista Superior)
    "5.00": "api_publica_tst",
}

SEGMENTO_MAP = {
    "1": "stf",
    "2": "cnj",
    "3": "stj",
    "4": "federal",
    "5": "trabalhista",
    "6": "eleitoral",
    "7": "militar_federal",
    "8": "estadual",
    "9": "militar_estadual",
}


def resolver_tribunal(numero_cnj: str) -> dict:
    """
    Extrai tribunal, segmento e índice DataJud do número CNJ.
    Formato: NNNNNNN-DD.AAAA.J.TT.OOOO
    Retorna: {"segmento": "estadual", "tribunal": "tjsp", "indice": "api_publica_tjsp"}
    """
    # Remove caracteres extras e normaliza
    numero = numero_cnj.strip()
    match = re.match(r'\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}', numero)
    if not match:
        raise ValueError(f"Número CNJ inválido: {numero_cnj}")

    j = match.group(1)   # segmento
    tt = match.group(2)  # código tribunal

    segmento = SEGMENTO_MAP.get(j, "desconhecido")
    chave = f"{j}.{tt}"
    indice = TRIBUNAL_INDEX_MAP.get(chave)

    if not indice:
        raise ValueError(f"Tribunal não mapeado para código {chave}")

    # Nome legível do tribunal (ex: "tjsp" do índice "api_publica_tjsp")
    tribunal = indice.replace("api_publica_", "")

    return {
        "segmento": segmento,
        "tribunal": tribunal,
        "indice": indice,
    }


def _hash_movimentacao(numero_cnj: str, data: str, descricao: str) -> str:
    """Hash SHA256 para identificar movimentação unicamente e evitar duplicatas."""
    raw = f"{numero_cnj}|{data}|{descricao}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def buscar_processo(numero_cnj: str, indice: str) -> Optional[dict]:
    """
    Busca um processo pelo número CNJ na API do DataJud.
    Retorna o documento completo ou None se não encontrado.
    """
    if not DATAJUD_API_KEY:
        logger.error("DATAJUD_API_KEY não configurada nas settings")
        return None

    url = f"{DATAJUD_BASE_URL}/{indice}/_search"
    payload = {
        "query": {
            "match": {
                "numeroProcesso": numero_cnj
            }
        },
        "size": 1
    }
    headers = {
        "Authorization": f"APIKey {DATAJUD_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        hits = data.get("hits", {}).get("hits", [])
        if not hits:
            logger.info(f"Processo {numero_cnj} não encontrado no DataJud ({indice})")
            return None

        return hits[0]

    except httpx.HTTPStatusError as e:
        logger.error(f"DataJud HTTP {e.response.status_code} para {numero_cnj}: {e.response.text[:300]}")
        return None
    except Exception as e:
        logger.error(f"Erro ao consultar DataJud para {numero_cnj}: {e}")
        return None


def extrair_movimentacoes(hit: dict, numero_cnj: str) -> list[dict]:
    """
    Extrai lista de movimentações de um hit do DataJud.
    Retorna lista de dicts prontos para criar MovimentacaoProcesso.
    """
    source = hit.get("_source", {})
    movimentos = source.get("movimentos", [])
    resultado = []

    for mov in movimentos:
        data_str = mov.get("dataHora") or mov.get("data")
        if not data_str:
            continue

        # Normaliza data (pode vir como "2024-01-15T10:30:00" ou "2024-01-15")
        try:
            if "T" in data_str:
                data_dt = datetime.fromisoformat(data_str.replace("Z", "+00:00"))
            else:
                data_dt = datetime.strptime(data_str, "%Y-%m-%d")
        except Exception:
            continue

        descricao = mov.get("nome") or mov.get("descricao") or ""
        if not descricao:
            continue

        codigo = mov.get("codigo")
        datajud_hash = _hash_movimentacao(numero_cnj, data_str, descricao)

        resultado.append({
            "data_movimentacao": data_dt,
            "codigo_nacional": codigo,
            "descricao": descricao,
            "datajud_hash": datajud_hash,
        })

    return resultado


def extrair_dados_processo(hit: dict) -> dict:
    """
    Extrai metadados do processo (partes, classe, assunto, etc.) de um hit DataJud.
    """
    source = hit.get("_source", {})

    # Classe
    classe = ""
    if source.get("classe"):
        classe = source["classe"].get("nome", "")

    # Assunto principal
    assunto = ""
    assuntos = source.get("assuntos", [])
    if assuntos:
        assunto = assuntos[0].get("nome", "")

    # Órgão julgador
    orgao = ""
    if source.get("orgaoJulgador"):
        orgao = source["orgaoJulgador"].get("nome", "")

    # Partes
    partes = []
    for parte in source.get("partes", []):
        polo = parte.get("polo", "").lower()
        nome = parte.get("nome", "")
        if nome:
            partes.append({"nome": nome, "tipo": polo})

    # Status (última movimentação como status)
    status = ""
    movimentos = source.get("movimentos", [])
    if movimentos:
        ultimo = sorted(movimentos, key=lambda m: m.get("dataHora", ""), reverse=True)
        if ultimo:
            status = ultimo[0].get("nome", "")

    return {
        "datajud_id": hit.get("_id"),
        "classe": classe,
        "assunto": assunto,
        "orgao_julgador": orgao,
        "partes": partes,
        "status_atual": status,
    }
