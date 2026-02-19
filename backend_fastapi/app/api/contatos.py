"""
Endpoints para gerenciamento de Contatos e Listas de Contatos
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import Optional
import io
import csv
import re
import logging

from app.database.database import get_db
from app.models.models import Cliente, MensagemLog, ListaContatos, ListaContatosMembro, Atendimento
from app.core.dependencies import CurrentEmpresa
from app.schemas.contatos import (
    ContatoUnificado, ContatoListResponse,
    ListaContatosCreate, ListaContatosUpdate, ListaContatosResponse,
    ListaContatosMembroAdd, ListaContatosMembroResponse,
)

logger = logging.getLogger("contatos_api")

router = APIRouter()


# ========== CONTATOS UNIFICADOS ==========

@router.get("/contatos", response_model=ContatoListResponse)
async def listar_contatos(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tipo: Optional[str] = None,  # 'registrado', 'nao_registrado'
):
    """
    Lista unificada de contatos: clientes registrados + números de MensagemLog.
    """
    contatos_map = {}

    # 1. Clientes registrados
    clientes_query = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id
    )
    if search:
        clientes_query = clientes_query.filter(
            (Cliente.nome_completo.ilike(f"%{search}%")) |
            (Cliente.whatsapp_number.ilike(f"%{search}%")) |
            (Cliente.cidade.ilike(f"%{search}%"))
        )

    for cliente in clientes_query.all():
        # Buscar última mensagem
        ultima_msg = db.query(func.max(MensagemLog.timestamp)).filter(
            MensagemLog.empresa_id == empresa_id,
            MensagemLog.whatsapp_number == cliente.whatsapp_number
        ).scalar()

        total_msgs = db.query(func.count(MensagemLog.id)).filter(
            MensagemLog.empresa_id == empresa_id,
            MensagemLog.whatsapp_number == cliente.whatsapp_number
        ).scalar()

        contatos_map[cliente.whatsapp_number] = ContatoUnificado(
            whatsapp_number=cliente.whatsapp_number,
            nome=cliente.nome_completo,
            cidade=cliente.cidade,
            cliente_id=cliente.id,
            registrado=True,
            ultimo_contato=ultima_msg,
            total_mensagens=total_msgs or 0,
        )

    # 2. Números de MensagemLog não registrados
    if tipo != 'registrado':
        registered_numbers = [c.whatsapp_number for c in
                              db.query(Cliente.whatsapp_number).filter(
                                  Cliente.empresa_id == empresa_id).all()]

        log_numbers_query = db.query(
            MensagemLog.whatsapp_number,
            func.max(MensagemLog.timestamp).label('ultimo_contato'),
            func.count(MensagemLog.id).label('total_msgs')
        ).filter(
            MensagemLog.empresa_id == empresa_id,
        ).group_by(MensagemLog.whatsapp_number)

        if search:
            log_numbers_query = log_numbers_query.filter(
                MensagemLog.whatsapp_number.ilike(f"%{search}%")
            )

        for row in log_numbers_query.all():
            if row.whatsapp_number not in contatos_map:
                contatos_map[row.whatsapp_number] = ContatoUnificado(
                    whatsapp_number=row.whatsapp_number,
                    registrado=False,
                    ultimo_contato=row.ultimo_contato,
                    total_mensagens=row.total_msgs,
                )

    # Filter by tipo
    if tipo == 'registrado':
        contatos_list = [c for c in contatos_map.values() if c.registrado]
    elif tipo == 'nao_registrado':
        contatos_list = [c for c in contatos_map.values() if not c.registrado]
    else:
        contatos_list = list(contatos_map.values())

    # Sort by ultimo_contato descending
    contatos_list.sort(key=lambda c: c.ultimo_contato or "", reverse=True)

    total = len(contatos_list)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = contatos_list[start:end]

    return ContatoListResponse(
        contatos=paginated,
        total=total,
        page=page,
        per_page=per_page
    )


# ========== EXPORTAR CSV ==========

@router.get("/contatos/exportar")
async def exportar_contatos_csv(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Exporta todos os contatos como CSV."""
    # Clientes registrados
    clientes = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['WhatsApp', 'Nome', 'Cidade', 'CPF', 'Registrado'])

    registered_numbers = set()
    for c in clientes:
        writer.writerow([c.whatsapp_number, c.nome_completo, c.cidade or '', c.cpf or '', 'Sim'])
        registered_numbers.add(c.whatsapp_number)

    # Números não registrados
    log_numbers = db.query(
        distinct(MensagemLog.whatsapp_number)
    ).filter(
        MensagemLog.empresa_id == empresa_id
    ).all()

    for (number,) in log_numbers:
        if number not in registered_numbers:
            writer.writerow([number, '', '', '', 'Não'])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contatos.csv"}
    )


# ========== IMPORTAR CSV ==========

def _normalize_phone(number: str) -> Optional[str]:
    """Normaliza número de telefone: remove caracteres especiais, garante formato."""
    digits = re.sub(r'\D', '', number.strip())
    if not digits or len(digits) < 10:
        return None
    # Se não começar com 55, adicionar (Brasil)
    if len(digits) == 10 or len(digits) == 11:
        digits = "55" + digits
    return digits


@router.post("/contatos/importar-csv")
async def importar_csv(
    file: UploadFile = File(...),
    lista_id: Optional[int] = Query(None, description="ID da lista para adicionar os contatos importados"),
    empresa_id: CurrentEmpresa = None,
    db: Session = Depends(get_db),
):
    """
    Importa contatos de um arquivo CSV.
    Colunas aceitas: whatsapp_number (obrigatório), nome (opcional), cidade (opcional), cpf (opcional)
    """
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Apenas arquivos CSV são aceitos")

    contents = await file.read()

    # Tentar decodificar como UTF-8, fallback para latin-1
    try:
        text = contents.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = contents.decode('latin-1')

    reader = csv.DictReader(io.StringIO(text))

    # Validar que tem a coluna obrigatória
    fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]
    number_col = None
    for possible in ['whatsapp_number', 'whatsapp', 'numero', 'telefone', 'phone', 'number']:
        if possible in fieldnames:
            number_col = possible
            break

    if not number_col:
        raise HTTPException(
            status_code=400,
            detail="CSV deve ter coluna 'whatsapp_number', 'whatsapp', 'numero', 'telefone' ou 'phone'"
        )

    # Mapear colunas flexíveis
    nome_col = None
    for possible in ['nome', 'name', 'nome_completo']:
        if possible in fieldnames:
            nome_col = possible
            break

    cidade_col = None
    for possible in ['cidade', 'city']:
        if possible in fieldnames:
            cidade_col = possible
            break

    cpf_col = None
    for possible in ['cpf', 'documento']:
        if possible in fieldnames:
            cpf_col = possible
            break

    criados = 0
    atualizados = 0
    erros = 0
    adicionados_lista = 0
    numeros_importados = []

    # Renormalizar fieldnames no reader
    for row in reader:
        # Normalizar chaves do row para lowercase
        row_lower = {k.strip().lower(): v.strip() if v else '' for k, v in row.items()}

        raw_number = row_lower.get(number_col, '')
        phone = _normalize_phone(raw_number)
        if not phone:
            erros += 1
            continue

        nome = row_lower.get(nome_col, '') if nome_col else ''
        cidade = row_lower.get(cidade_col, '') if cidade_col else ''
        cpf = row_lower.get(cpf_col, '') if cpf_col else ''

        # Verificar se já existe como Cliente
        existing = db.query(Cliente).filter(
            Cliente.empresa_id == empresa_id,
            Cliente.whatsapp_number == phone,
        ).first()

        if existing:
            # Atualizar dados se fornecidos
            if nome and not existing.nome_completo:
                existing.nome_completo = nome
            if cidade and not existing.cidade:
                existing.cidade = cidade
            atualizados += 1
        else:
            # Criar novo Cliente (CPF pode ser vazio para importados)
            new_client = Cliente(
                empresa_id=empresa_id,
                nome_completo=nome or f"Contato {phone[-4:]}",
                cpf=cpf or f"IMPORT-{phone[-11:]}",
                whatsapp_number=phone,
                cidade=cidade or None,
            )
            db.add(new_client)
            criados += 1

        numeros_importados.append(phone)

    db.commit()

    # Adicionar à lista se informada
    if lista_id and numeros_importados:
        lista = db.query(ListaContatos).filter(
            ListaContatos.id == lista_id,
            ListaContatos.empresa_id == empresa_id,
        ).first()

        if lista:
            for phone in numeros_importados:
                exists = db.query(ListaContatosMembro).filter(
                    ListaContatosMembro.lista_id == lista_id,
                    ListaContatosMembro.whatsapp_number == phone,
                ).first()
                if not exists:
                    # Buscar nome e cliente_id
                    cliente = db.query(Cliente).filter(
                        Cliente.empresa_id == empresa_id,
                        Cliente.whatsapp_number == phone,
                    ).first()
                    membro = ListaContatosMembro(
                        lista_id=lista_id,
                        whatsapp_number=phone,
                        nome=cliente.nome_completo if cliente else None,
                        cliente_id=cliente.id if cliente else None,
                    )
                    db.add(membro)
                    adicionados_lista += 1
            db.commit()

    return {
        "criados": criados,
        "atualizados": atualizados,
        "erros": erros,
        "total_importados": len(numeros_importados),
        "adicionados_lista": adicionados_lista,
    }


# ========== LISTAS DE CONTATOS ==========

@router.post("/contatos/listas", response_model=ListaContatosResponse, status_code=201)
async def criar_lista(
    dados: ListaContatosCreate,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Cria uma nova lista de contatos."""
    lista = ListaContatos(
        empresa_id=empresa_id,
        nome=dados.nome,
        descricao=dados.descricao,
        cor=dados.cor,
    )
    db.add(lista)
    db.commit()
    db.refresh(lista)

    return ListaContatosResponse(
        id=lista.id,
        empresa_id=lista.empresa_id,
        nome=lista.nome,
        descricao=lista.descricao,
        cor=lista.cor,
        total_membros=0,
        criado_em=lista.criado_em,
        atualizado_em=lista.atualizado_em,
    )


@router.get("/contatos/listas")
async def listar_listas(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Lista todas as listas de contatos com contagem de membros."""
    listas = db.query(ListaContatos).filter(
        ListaContatos.empresa_id == empresa_id
    ).order_by(ListaContatos.criado_em.desc()).all()

    resultado = []
    for lista in listas:
        total = db.query(func.count(ListaContatosMembro.id)).filter(
            ListaContatosMembro.lista_id == lista.id
        ).scalar()

        resultado.append(ListaContatosResponse(
            id=lista.id,
            empresa_id=lista.empresa_id,
            nome=lista.nome,
            descricao=lista.descricao,
            cor=lista.cor,
            total_membros=total or 0,
            criado_em=lista.criado_em,
            atualizado_em=lista.atualizado_em,
        ))

    return resultado


@router.post("/contatos/listas/{lista_id}/adicionar")
async def adicionar_a_lista(
    lista_id: int,
    dados: ListaContatosMembroAdd,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Adiciona contatos a uma lista."""
    lista = db.query(ListaContatos).filter(
        ListaContatos.id == lista_id,
        ListaContatos.empresa_id == empresa_id
    ).first()

    if not lista:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    adicionados = 0
    duplicados = 0

    for contato in dados.contatos:
        number = contato.get("whatsapp_number")
        if not number:
            continue

        # Verificar se já existe
        existe = db.query(ListaContatosMembro).filter(
            ListaContatosMembro.lista_id == lista_id,
            ListaContatosMembro.whatsapp_number == number
        ).first()

        if existe:
            duplicados += 1
            continue

        membro = ListaContatosMembro(
            lista_id=lista_id,
            whatsapp_number=number,
            nome=contato.get("nome"),
            cliente_id=contato.get("cliente_id"),
        )
        db.add(membro)
        adicionados += 1

    db.commit()

    return {
        "adicionados": adicionados,
        "duplicados": duplicados,
        "total_lista": db.query(func.count(ListaContatosMembro.id)).filter(
            ListaContatosMembro.lista_id == lista_id
        ).scalar()
    }


@router.delete("/contatos/listas/{lista_id}")
async def deletar_lista(
    lista_id: int,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """Deleta uma lista de contatos."""
    lista = db.query(ListaContatos).filter(
        ListaContatos.id == lista_id,
        ListaContatos.empresa_id == empresa_id
    ).first()

    if not lista:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    db.delete(lista)
    db.commit()

    return {"detail": "Lista deletada com sucesso"}


# ========== DELETAR CONTATO ==========

@router.delete("/contatos/{whatsapp_number}")
async def deletar_contato(
    whatsapp_number: str,
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db),
):
    """
    Apaga um contato (cliente) e seu histórico de mensagens.
    Apenas empresa pode executar esta operação.
    """
    # Remove da lista de contatos membros
    db.query(ListaContatosMembro).filter(
        ListaContatosMembro.whatsapp_number == whatsapp_number
    ).delete()

    # Remove cliente registrado (se existir)
    db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.whatsapp_number == whatsapp_number
    ).delete()

    # Remove histórico de mensagens
    db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.whatsapp_number == whatsapp_number
    ).delete()

    # Remove atendimentos
    db.query(Atendimento).filter(
        Atendimento.empresa_id == empresa_id,
        Atendimento.whatsapp_number == whatsapp_number
    ).delete()

    db.commit()

    return {"detail": f"Contato {whatsapp_number} e histórico removidos com sucesso"}
