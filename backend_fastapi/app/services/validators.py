"""
Validadores e integrações com APIs externas.
"""
import re
import httpx
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)


def validar_cpf(cpf: str) -> bool:
    """
    Valida se um CPF é válido.

    Args:
        cpf: String com o CPF (pode ter ou não formatação)

    Returns:
        True se válido, False caso contrário
    """
    # Remove caracteres não numéricos
    cpf = re.sub(r'\D', '', cpf)

    # Verifica se tem 11 dígitos
    if len(cpf) != 11:
        return False

    # Verifica se todos os dígitos são iguais
    if cpf == cpf[0] * 11:
        return False

    # Calcula o primeiro dígito verificador
    soma = sum(int(cpf[i]) * (10 - i) for i in range(9))
    resto = soma % 11
    digito1 = 0 if resto < 2 else 11 - resto

    if int(cpf[9]) != digito1:
        return False

    # Calcula o segundo dígito verificador
    soma = sum(int(cpf[i]) * (11 - i) for i in range(10))
    resto = soma % 11
    digito2 = 0 if resto < 2 else 11 - resto

    if int(cpf[10]) != digito2:
        return False

    return True


def formatar_cpf(cpf: str) -> str:
    """
    Formata um CPF no padrão XXX.XXX.XXX-XX.
    """
    cpf = re.sub(r'\D', '', cpf)
    if len(cpf) == 11:
        return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
    return cpf


def validar_telefone_brasileiro(telefone: str) -> bool:
    """
    Valida formato de telefone brasileiro.

    Aceita formatos:
    - (XX) XXXXX-XXXX
    - (XX) XXXX-XXXX
    - XX XXXXX-XXXX
    - XXXXXXXXXXX
    - XXXXXXXXXX
    """
    telefone = re.sub(r'\D', '', telefone)

    # Telefone celular: 11 dígitos (XX 9XXXX-XXXX)
    # Telefone fixo: 10 dígitos (XX XXXX-XXXX)
    if len(telefone) not in [10, 11]:
        return False

    # Verifica se o DDD é válido (entre 11 e 99)
    ddd = int(telefone[:2])
    if ddd < 11 or ddd > 99:
        return False

    # Se for celular, o terceiro dígito deve ser 9
    if len(telefone) == 11 and telefone[2] != '9':
        return False

    return True


async def consultar_cep(cep: str) -> Optional[Dict]:
    """
    Consulta um CEP na API ViaCEP.

    Args:
        cep: String com o CEP (pode ter ou não formatação)

    Returns:
        Dict com os dados do endereço ou None se não encontrado
    """
    cep = re.sub(r'\D', '', cep)

    if len(cep) != 8:
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=5.0)
            response.raise_for_status()
            data = response.json()

        if data.get('erro'):
            return None

        return {
            'cep': cep,
            'logradouro': data.get('logradouro', ''),
            'complemento': data.get('complemento', ''),
            'bairro': data.get('bairro', ''),
            'cidade': data.get('localidade', ''),
            'uf': data.get('uf', ''),
            'endereco_completo': f"{data.get('logradouro', '')}, {data.get('bairro', '')}, {data.get('localidade', '')} - {data.get('uf', '')}"
        }
    except Exception as e:
        logger.error(f"Erro ao consultar CEP {cep}: {e}")
        return None


async def consultar_cnpj_receita(cnpj: str) -> Optional[Dict]:
    """
    Consulta um CNPJ na API da Receita Federal (via API pública).

    Args:
        cnpj: String com o CNPJ (pode ter ou não formatação)

    Returns:
        Dict com os dados da empresa ou None se não encontrado
    """
    cnpj = re.sub(r'\D', '', cnpj)

    if len(cnpj) != 14:
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://www.receitaws.com.br/v1/cnpj/{cnpj}", timeout=10.0)
            response.raise_for_status()
            data = response.json()

        if data.get('status') == 'ERROR':
            return None

        return {
            'cnpj': cnpj,
            'razao_social': data.get('nome', ''),
            'nome_fantasia': data.get('fantasia', ''),
            'situacao': data.get('situacao', ''),
            'tipo': data.get('tipo', ''),
            'telefone': data.get('telefone', ''),
            'email': data.get('email', ''),
            'endereco': f"{data.get('logradouro', '')}, {data.get('numero', '')} - {data.get('bairro', '')}, {data.get('municipio', '')} - {data.get('uf', '')}"
        }
    except Exception as e:
        logger.error(f"Erro ao consultar CNPJ {cnpj}: {e}")
        return None


def validar_email(email: str) -> bool:
    """
    Valida formato de email.
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def normalizar_numero_whatsapp(numero: str) -> str:
    """
    Normaliza número de WhatsApp para o formato internacional (sem símbolos).

    Args:
        numero: Número de telefone

    Returns:
        Número no formato: 5511999999999 (código do país + DDD + número)
    """
    # Remove todos os caracteres não numéricos
    numero = re.sub(r'\D', '', numero)

    # Se não começa com 55 (código do Brasil), adiciona
    if not numero.startswith('55'):
        numero = '55' + numero

    return numero


def formatar_telefone(telefone: str) -> str:
    """
    Formata um telefone brasileiro no padrão (XX) XXXXX-XXXX ou (XX) XXXX-XXXX.
    """
    telefone = re.sub(r'\D', '', telefone)

    if len(telefone) == 11:
        return f"({telefone[:2]}) {telefone[2:7]}-{telefone[7:]}"
    elif len(telefone) == 10:
        return f"({telefone[:2]}) {telefone[2:6]}-{telefone[6:]}"

    return telefone
