"""
API de processos judiciais — módulo jurídico.
CRUD de processos + histórico de movimentações.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime

from app.database.database import get_db
from app.models.models import ProcessoJudicial, MovimentacaoProcesso, Cliente
from app.core.dependencies import CurrentUser, EmpresaIdFromToken
from app.services.datajud import resolver_tribunal, buscar_processo, extrair_dados_processo, extrair_movimentacoes

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _processo_resumo(p: ProcessoJudicial) -> dict:
    return {
        "id": p.id,
        "numero_cnj": p.numero_cnj,
        "tribunal": p.tribunal,
        "segmento": p.segmento,
        "classe": p.classe,
        "assunto": p.assunto,
        "status_atual": p.status_atual,
        "cliente_id": p.cliente_id,
        "notificar_cliente": p.notificar_cliente,
        "ativo": p.ativo,
        "ultima_verificacao": p.ultima_verificacao.isoformat() if p.ultima_verificacao else None,
        "ultima_movimentacao_data": p.ultima_movimentacao_data.isoformat() if p.ultima_movimentacao_data else None,
        "criado_em": p.criado_em.isoformat() if p.criado_em else None,
    }


def _processo_detalhe(p: ProcessoJudicial) -> dict:
    base = _processo_resumo(p)
    base["partes"] = p.partes or []
    base["orgao_julgador"] = p.orgao_julgador
    base["indice_datajud"] = p.indice_datajud
    base["movimentacoes"] = [_movimentacao_dict(m) for m in (p.movimentacoes or [])]
    return base


def _movimentacao_dict(m: MovimentacaoProcesso) -> dict:
    return {
        "id": m.id,
        "data_movimentacao": m.data_movimentacao.isoformat(),
        "descricao": m.descricao,
        "resumo_ia": m.resumo_ia,
        "codigo_nacional": m.codigo_nacional,
        "notificado_cliente": m.notificado_cliente,
        "notificado_em": m.notificado_em.isoformat() if m.notificado_em else None,
        "criado_em": m.criado_em.isoformat() if m.criado_em else None,
    }


# ─── Processos ────────────────────────────────────────────────────────────────

@router.get("/processos/")
async def listar_processos(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    cliente_id: Optional[int] = Query(None),
    ativo: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Lista processos da empresa com filtros opcionais."""
    query = db.query(ProcessoJudicial).filter(ProcessoJudicial.empresa_id == empresa_id)

    if cliente_id is not None:
        query = query.filter(ProcessoJudicial.cliente_id == cliente_id)
    if ativo is not None:
        query = query.filter(ProcessoJudicial.ativo == ativo)

    total = query.count()
    processos = query.order_by(ProcessoJudicial.criado_em.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_processo_resumo(p) for p in processos],
    }


@router.post("/processos/", status_code=201)
async def cadastrar_processo(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Cadastra novo processo judicial.
    Identifica tribunal automaticamente pelo número CNJ.
    Dispara primeira verificação no DataJud em background.
    """
    numero_cnj = (dados.get("numero_cnj") or "").strip()
    if not numero_cnj:
        raise HTTPException(status_code=400, detail="numero_cnj é obrigatório")

    # Resolve tribunal pelo número CNJ
    try:
        info_tribunal = resolver_tribunal(numero_cnj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Verifica se já existe
    existente = db.query(ProcessoJudicial).filter(
        ProcessoJudicial.empresa_id == empresa_id,
        ProcessoJudicial.numero_cnj == numero_cnj,
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail="Processo já cadastrado para esta empresa")

    # Valida cliente se fornecido
    cliente_id = dados.get("cliente_id")
    if cliente_id:
        cliente = db.query(Cliente).filter(
            Cliente.id == cliente_id,
            Cliente.empresa_id == empresa_id,
        ).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")

    processo = ProcessoJudicial(
        empresa_id=empresa_id,
        cliente_id=cliente_id,
        numero_cnj=numero_cnj,
        tribunal=info_tribunal["tribunal"],
        segmento=info_tribunal["segmento"],
        indice_datajud=info_tribunal["indice"],
        notificar_cliente=dados.get("notificar_cliente", True),
        ativo=True,
    )
    db.add(processo)
    db.commit()
    db.refresh(processo)

    # Consulta DataJud imediatamente para já popular dados e movimentações
    background_tasks.add_task(_popular_dados_iniciais, processo.id)

    return _processo_resumo(processo)


def _popular_dados_iniciais(processo_id: int):
    """
    Chama DataJud logo após o cadastro para popular classe, assunto, partes e movimentações.
    Roda em background via FastAPI BackgroundTasks (sem asyncio).
    """
    from app.database.database import SessionLocal
    db = SessionLocal()
    try:
        processo = db.query(ProcessoJudicial).filter(ProcessoJudicial.id == processo_id).first()
        if not processo:
            return

        hit = buscar_processo(processo.numero_cnj, processo.indice_datajud)
        if not hit:
            return

        # Atualiza metadados
        dados = extrair_dados_processo(hit)
        for campo, valor in dados.items():
            if campo == "partes":
                if valor:
                    processo.partes = valor
            elif valor:
                setattr(processo, campo, valor)

        processo.ultima_verificacao = datetime.utcnow()

        # Importa movimentações existentes (sem notificar — são históricas)
        movs = extrair_movimentacoes(hit, processo.numero_cnj)
        hashes = {
            m.datajud_hash
            for m in db.query(MovimentacaoProcesso.datajud_hash)
            .filter(MovimentacaoProcesso.processo_id == processo_id).all()
        }
        for mov_data in movs:
            if mov_data["datajud_hash"] in hashes:
                continue
            nova = MovimentacaoProcesso(
                processo_id=processo_id,
                data_movimentacao=mov_data["data_movimentacao"],
                codigo_nacional=mov_data.get("codigo_nacional"),
                descricao=mov_data["descricao"],
                datajud_hash=mov_data["datajud_hash"],
                notificado_cliente=False,  # históricas não notificam
            )
            db.add(nova)
            if not processo.ultima_movimentacao_data or mov_data["data_movimentacao"] > processo.ultima_movimentacao_data:
                processo.ultima_movimentacao_data = mov_data["data_movimentacao"]

        db.commit()
    except Exception as e:
        import logging
        logging.getLogger("processos").error(f"Erro ao popular dados iniciais do processo {processo_id}: {e}")
    finally:
        db.close()


def _verificar_agora_bg(processo_id: int):
    """Enfileira task de verificação imediata."""
    try:
        from app.tasks.juridico_tasks import verificar_processo_agora
        verificar_processo_agora.delay(processo_id)
    except Exception:
        pass


@router.get("/processos/{processo_id}")
async def detalhe_processo(
    processo_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Retorna processo com todas as movimentações."""
    processo = db.query(ProcessoJudicial).options(
        joinedload(ProcessoJudicial.movimentacoes)
    ).filter(
        ProcessoJudicial.id == processo_id,
        ProcessoJudicial.empresa_id == empresa_id,
    ).first()

    if not processo:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    return _processo_detalhe(processo)


@router.put("/processos/{processo_id}")
async def atualizar_processo(
    processo_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Atualiza configurações do processo (cliente vinculado, notificações, ativo)."""
    processo = db.query(ProcessoJudicial).filter(
        ProcessoJudicial.id == processo_id,
        ProcessoJudicial.empresa_id == empresa_id,
    ).first()
    if not processo:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    if "cliente_id" in dados:
        if dados["cliente_id"]:
            cliente = db.query(Cliente).filter(
                Cliente.id == dados["cliente_id"],
                Cliente.empresa_id == empresa_id,
            ).first()
            if not cliente:
                raise HTTPException(status_code=404, detail="Cliente não encontrado")
        processo.cliente_id = dados["cliente_id"]

    if "notificar_cliente" in dados:
        processo.notificar_cliente = bool(dados["notificar_cliente"])
    if "ativo" in dados:
        processo.ativo = bool(dados["ativo"])

    db.commit()
    return {"ok": True, "id": processo.id}


@router.delete("/processos/{processo_id}")
async def deletar_processo(
    processo_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Remove processo e todas as movimentações (CASCADE)."""
    processo = db.query(ProcessoJudicial).filter(
        ProcessoJudicial.id == processo_id,
        ProcessoJudicial.empresa_id == empresa_id,
    ).first()
    if not processo:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    db.delete(processo)
    db.commit()
    return {"ok": True}


@router.post("/processos/{processo_id}/verificar-agora")
async def verificar_agora(
    processo_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Força verificação imediata de um processo no DataJud."""
    processo = db.query(ProcessoJudicial).filter(
        ProcessoJudicial.id == processo_id,
        ProcessoJudicial.empresa_id == empresa_id,
    ).first()
    if not processo:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    try:
        from app.tasks.juridico_tasks import verificar_processo_agora
        task = verificar_processo_agora.delay(processo_id)
        return {"ok": True, "task_id": task.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao enfileirar verificação: {e}")


# ─── Movimentações ────────────────────────────────────────────────────────────

@router.get("/processos/{processo_id}/movimentacoes")
async def listar_movimentacoes(
    processo_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Lista movimentações de um processo com paginação."""
    # Valida ownership
    processo = db.query(ProcessoJudicial).filter(
        ProcessoJudicial.id == processo_id,
        ProcessoJudicial.empresa_id == empresa_id,
    ).first()
    if not processo:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    query = db.query(MovimentacaoProcesso).filter(
        MovimentacaoProcesso.processo_id == processo_id
    )
    total = query.count()
    movs = query.order_by(MovimentacaoProcesso.data_movimentacao.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_movimentacao_dict(m) for m in movs],
    }
