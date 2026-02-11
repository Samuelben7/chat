"""
Endpoints para gerenciamento de Contatos e Listas de Contatos
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import Optional
import io
import csv

from app.database.database import get_db
from app.models.models import Cliente, MensagemLog, ListaContatos, ListaContatosMembro
from app.core.dependencies import CurrentEmpresa
from app.schemas.contatos import (
    ContatoUnificado, ContatoListResponse,
    ListaContatosCreate, ListaContatosUpdate, ListaContatosResponse,
    ListaContatosMembroAdd, ListaContatosMembroResponse,
)

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
