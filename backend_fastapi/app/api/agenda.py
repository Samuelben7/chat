"""
P1 - Agenda Inteligente
Endpoints para horários de funcionamento, slots e agendamentos.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import Optional, List
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import calendar
import json as _json
import redis as _redis_lib

_TZ_BR = ZoneInfo('America/Sao_Paulo')

def _hoje() -> date:
    """Retorna a data atual no fuso de São Paulo (UTC-3)."""
    return datetime.now(_TZ_BR).date()

from app.database.database import get_db
from app.models.models import (
    AgendaHorarioFuncionamento, AgendaSlot, AgendaAgendamento, Cliente
)
from app.core.dependencies import CurrentUser, EmpresaIdFromToken
from app.core.config import settings as _settings

router = APIRouter()

# ─── Redis Cache Helper ────────────────────────────────────────────────────────

_CACHE_TTL_CAL   = 300   # 5 min — calendário mensal
_CACHE_TTL_SLOTS = 120   # 2 min — slots de um dia

def _redis() -> Optional[_redis_lib.Redis]:
    """Retorna cliente Redis sync, ou None se indisponível."""
    try:
        r = _redis_lib.from_url(
            _settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        r.ping()
        return r
    except Exception:
        return None

def _cache_get(r, key):
    if not r:
        return None
    try:
        v = r.get(key)
        return _json.loads(v) if v else None
    except Exception:
        return None

def _cache_set(r, key, data, ttl: int):
    if not r:
        return
    try:
        r.setex(key, ttl, _json.dumps(data, default=str))
    except Exception:
        pass

def _cache_del(r, *keys):
    if not r:
        return
    try:
        r.delete(*keys)
    except Exception:
        pass

def _invalidar_dia(r, empresa_id: int, data_obj: date):
    """Invalida cache do dia específico e do mês correspondente."""
    _cache_del(
        r,
        f"agenda:slots:{empresa_id}:{data_obj.isoformat()}",
        f"agenda:cal:{empresa_id}:{data_obj.year}:{data_obj.month}",
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _add_minutes(hora: str, minutos: int) -> str:
    """Soma minutos a uma string HH:MM e retorna HH:MM."""
    h, m = map(int, hora.split(':'))
    total = h * 60 + m + minutos
    return f"{total // 60:02d}:{total % 60:02d}"


def _time_to_minutes(hora: str) -> int:
    h, m = map(int, hora.split(':'))
    return h * 60 + m


def _gerar_slots_do_dia(
    empresa_id: int,
    data_alvo: date,
    horarios: List[AgendaHorarioFuncionamento],
    db: Session,
    sobrescrever: bool = False
) -> int:
    """Gera slots para um dia com base nos horários de funcionamento. Retorna contagem criada."""
    dia_semana = data_alvo.weekday()  # Python: 0=seg..6=dom
    # Converter: BD usa 0=dom..6=sab → Python usa 0=seg..6=dom
    # Mapear: dia_semana_bd = (python_weekday + 1) % 7
    dia_bd = (dia_semana + 1) % 7

    horarios_dia = [h for h in horarios if h.dia_semana == dia_bd and h.ativo]
    if not horarios_dia:
        return 0

    criados = 0
    for horario in horarios_dia:
        ini = _time_to_minutes(horario.hora_inicio)
        fim = _time_to_minutes(horario.hora_fim)
        intervalo = horario.intervalo_minutos or 60
        vagas = horario.vagas_por_slot or 1

        cursor = ini
        while cursor + intervalo <= fim:
            h_ini = f"{cursor // 60:02d}:{cursor % 60:02d}"
            h_fim = f"{(cursor + intervalo) // 60:02d}:{(cursor + intervalo) % 60:02d}"

            # Verificar se já existe
            existente = db.query(AgendaSlot).filter(
                AgendaSlot.empresa_id == empresa_id,
                AgendaSlot.data == data_alvo,
                AgendaSlot.hora_inicio == h_ini,
            ).first()

            if not existente:
                slot = AgendaSlot(
                    empresa_id=empresa_id,
                    data=data_alvo,
                    hora_inicio=h_ini,
                    hora_fim=h_fim,
                    vagas_total=vagas,
                    vagas_ocupadas=0,
                    status='disponivel',
                )
                db.add(slot)
                criados += 1
            cursor += intervalo

    db.commit()
    return criados


# ─── Horários de Funcionamento ─────────────────────────────────────────────────

@router.get("/agenda/horarios")
async def listar_horarios(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Lista horários de funcionamento da empresa."""
    horarios = db.query(AgendaHorarioFuncionamento).filter(
        AgendaHorarioFuncionamento.empresa_id == empresa_id
    ).order_by(AgendaHorarioFuncionamento.dia_semana, AgendaHorarioFuncionamento.hora_inicio).all()

    dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    return [
        {
            "id": h.id,
            "dia_semana": h.dia_semana,
            "dia_nome": dias[h.dia_semana],
            "hora_inicio": h.hora_inicio,
            "hora_fim": h.hora_fim,
            "intervalo_minutos": h.intervalo_minutos,
            "vagas_por_slot": h.vagas_por_slot,
            "ativo": h.ativo,
        }
        for h in horarios
    ]


@router.post("/agenda/horarios", status_code=201)
async def criar_horario(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Cria um horário de funcionamento."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode gerenciar horários")

    horario = AgendaHorarioFuncionamento(
        empresa_id=empresa_id,
        dia_semana=dados["dia_semana"],
        hora_inicio=dados["hora_inicio"],
        hora_fim=dados["hora_fim"],
        intervalo_minutos=dados.get("intervalo_minutos", 60),
        vagas_por_slot=dados.get("vagas_por_slot", 1),
        ativo=dados.get("ativo", True),
    )
    db.add(horario)
    db.commit()
    db.refresh(horario)
    return {"id": horario.id, "message": "Horário criado"}


@router.put("/agenda/horarios/{horario_id}")
async def atualizar_horario(
    horario_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Atualiza um horário de funcionamento."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode gerenciar horários")

    horario = db.query(AgendaHorarioFuncionamento).filter(
        AgendaHorarioFuncionamento.id == horario_id,
        AgendaHorarioFuncionamento.empresa_id == empresa_id
    ).first()
    if not horario:
        raise HTTPException(status_code=404, detail="Horário não encontrado")

    for field in ['hora_inicio', 'hora_fim', 'intervalo_minutos', 'vagas_por_slot', 'ativo']:
        if field in dados:
            setattr(horario, field, dados[field])

    db.commit()
    return {"message": "Horário atualizado"}


@router.delete("/agenda/horarios/{horario_id}")
async def deletar_horario(
    horario_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Remove um horário de funcionamento."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode gerenciar horários")

    horario = db.query(AgendaHorarioFuncionamento).filter(
        AgendaHorarioFuncionamento.id == horario_id,
        AgendaHorarioFuncionamento.empresa_id == empresa_id
    ).first()
    if not horario:
        raise HTTPException(status_code=404, detail="Horário não encontrado")

    db.delete(horario)
    db.commit()
    return {"message": "Horário removido"}


# ─── Slots ─────────────────────────────────────────────────────────────────────

@router.get("/agenda/calendario")
async def ver_calendario(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2024),
):
    """Retorna visão do mês com contagem de slots por dia."""
    r = _redis()
    cache_key = f"agenda:cal:{empresa_id}:{ano}:{mes}"
    cached = _cache_get(r, cache_key)
    if cached is not None:
        return cached

    primeiro_dia = date(ano, mes, 1)
    ultimo_dia = date(ano, mes, calendar.monthrange(ano, mes)[1])

    slots = db.query(
        AgendaSlot.data,
        func.count(AgendaSlot.id).label('total'),
        func.sum(
            case((AgendaSlot.status == 'disponivel', 1), else_=0)
        ).label('disponiveis'),
        func.sum(AgendaSlot.vagas_ocupadas).label('ocupados'),
    ).filter(
        AgendaSlot.empresa_id == empresa_id,
        AgendaSlot.data >= primeiro_dia,
        AgendaSlot.data <= ultimo_dia,
    ).group_by(AgendaSlot.data).all()

    dias_map = {}
    for row in slots:
        dias_map[str(row.data)] = {
            "total_slots": row.total,
            "disponiveis": row.disponiveis or 0,
            "ocupados": row.ocupados or 0,
        }

    # Preencher todos os dias do mês
    resultado = []
    current = primeiro_dia
    while current <= ultimo_dia:
        chave = str(current)
        resultado.append({
            "data": chave,
            "dia_semana": current.weekday(),  # 0=seg
            **dias_map.get(chave, {"total_slots": 0, "disponiveis": 0, "ocupados": 0})
        })
        current += timedelta(days=1)

    _cache_set(r, cache_key, resultado, _CACHE_TTL_CAL)
    return resultado


@router.get("/agenda/slots")
async def listar_slots_dia(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    data: str = Query(..., description="Data no formato YYYY-MM-DD"),
):
    """Lista todos os slots de um dia com seus agendamentos."""
    try:
        data_alvo = date.fromisoformat(data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD")

    r = _redis()
    cache_key = f"agenda:slots:{empresa_id}:{data}"
    cached = _cache_get(r, cache_key)
    if cached is not None:
        return cached

    slots = db.query(AgendaSlot).filter(
        AgendaSlot.empresa_id == empresa_id,
        AgendaSlot.data == data_alvo,
    ).order_by(AgendaSlot.hora_inicio).all()

    resultado = []
    for slot in slots:
        agendamentos = [
            {
                "id": ag.id,
                "whatsapp_number": ag.whatsapp_number,
                "nome_cliente": ag.nome_cliente,
                "status": ag.status,
                "observacoes": ag.observacoes,
            }
            for ag in slot.agendamentos
            if ag.status != 'cancelado'
        ]
        resultado.append({
            "id": slot.id,
            "data": str(slot.data),
            "hora_inicio": slot.hora_inicio,
            "hora_fim": slot.hora_fim,
            "vagas_total": slot.vagas_total,
            "vagas_ocupadas": slot.vagas_ocupadas,
            "vagas_livres": slot.vagas_total - slot.vagas_ocupadas,
            "status": slot.status,
            "observacao": slot.observacao,
            "agendamentos": agendamentos,
        })

    _cache_set(r, cache_key, resultado, _CACHE_TTL_SLOTS)
    return resultado


@router.post("/agenda/slots/gerar")
async def gerar_slots(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """
    Gera slots automaticamente para um período com base nos horários de funcionamento.
    Body: { "data_inicio": "YYYY-MM-DD", "data_fim": "YYYY-MM-DD" }
    """
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode gerar slots")

    try:
        data_ini = date.fromisoformat(dados["data_inicio"])
        data_fim = date.fromisoformat(dados["data_fim"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="data_inicio e data_fim obrigatórios (YYYY-MM-DD)")

    if (data_fim - data_ini).days > 90:
        raise HTTPException(status_code=400, detail="Período máximo de 90 dias por geração")

    horarios = db.query(AgendaHorarioFuncionamento).filter(
        AgendaHorarioFuncionamento.empresa_id == empresa_id,
        AgendaHorarioFuncionamento.ativo == True
    ).all()

    if not horarios:
        raise HTTPException(status_code=400, detail="Nenhum horário de funcionamento configurado")

    total_criados = 0
    current = data_ini
    meses_invalidados = set()
    while current <= data_fim:
        total_criados += _gerar_slots_do_dia(empresa_id, current, horarios, db)
        meses_invalidados.add((current.year, current.month))
        current += timedelta(days=1)

    r = _redis()
    for (ano_inv, mes_inv) in meses_invalidados:
        _cache_del(r, f"agenda:cal:{empresa_id}:{ano_inv}:{mes_inv}")

    return {"slots_criados": total_criados, "periodo": f"{data_ini} a {data_fim}"}


@router.post("/agenda/slots", status_code=201)
async def criar_slot_manual(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Cria um slot manualmente."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode criar slots")

    try:
        data_alvo = date.fromisoformat(dados["data"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Campo 'data' obrigatório (YYYY-MM-DD)")

    slot = AgendaSlot(
        empresa_id=empresa_id,
        data=data_alvo,
        hora_inicio=dados["hora_inicio"],
        hora_fim=dados["hora_fim"],
        vagas_total=dados.get("vagas_total", 1),
        vagas_ocupadas=0,
        status='disponivel',
        observacao=dados.get("observacao"),
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    _invalidar_dia(_redis(), empresa_id, data_alvo)
    return {"id": slot.id, "message": "Slot criado"}


@router.post("/agenda/slots/{slot_id}/bloquear")
async def bloquear_slot(
    slot_id: int,
    dados: dict = {},
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Bloqueia um slot (não aceita mais agendamentos)."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode bloquear slots")

    slot = db.query(AgendaSlot).filter(
        AgendaSlot.id == slot_id,
        AgendaSlot.empresa_id == empresa_id
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    slot.status = 'bloqueado'
    slot.observacao = dados.get("motivo", slot.observacao)
    db.commit()
    _invalidar_dia(_redis(), empresa_id, slot.data)
    return {"message": "Slot bloqueado"}


@router.post("/agenda/slots/{slot_id}/desbloquear")
async def desbloquear_slot(
    slot_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Desbloqueia um slot."""
    slot = db.query(AgendaSlot).filter(
        AgendaSlot.id == slot_id,
        AgendaSlot.empresa_id == empresa_id
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    slot.status = 'disponivel' if slot.vagas_ocupadas < slot.vagas_total else 'lotado'
    db.commit()
    _invalidar_dia(_redis(), empresa_id, slot.data)
    return {"message": "Slot desbloqueado"}


@router.patch("/agenda/slots/{slot_id}")
async def atualizar_slot(
    slot_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Atualiza vagas_total de um slot sem deletar agendamentos."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode editar slots")

    slot = db.query(AgendaSlot).filter(
        AgendaSlot.id == slot_id,
        AgendaSlot.empresa_id == empresa_id
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    novas_vagas = dados.get("vagas_total")
    if novas_vagas is not None:
        if novas_vagas < slot.vagas_ocupadas:
            raise HTTPException(status_code=400, detail=f"Vagas não podem ser menores que os agendamentos já existentes ({slot.vagas_ocupadas})")
        slot.vagas_total = novas_vagas
        if slot.vagas_ocupadas >= novas_vagas:
            slot.status = 'lotado'
        elif slot.status == 'lotado':
            slot.status = 'disponivel'

    db.commit()
    _invalidar_dia(_redis(), empresa_id, slot.data)
    return {"id": slot.id, "vagas_total": slot.vagas_total, "message": "Slot atualizado"}


@router.delete("/agenda/slots")
async def deletar_slots_dia(
    data: str = Query(..., description="Data YYYY-MM-DD"),
    user: CurrentUser = None,
    empresa_id: EmpresaIdFromToken = None,
    db: Session = Depends(get_db)
):
    """Remove todos os slots de um dia inteiro."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode remover slots")

    try:
        data_alvo = date.fromisoformat(data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD")

    slots = db.query(AgendaSlot).filter(
        AgendaSlot.empresa_id == empresa_id,
        AgendaSlot.data == data_alvo,
    ).all()

    for slot in slots:
        db.delete(slot)
    db.commit()
    _invalidar_dia(_redis(), empresa_id, data_alvo)
    return {"message": f"{len(slots)} slots removidos para {data}"}


@router.delete("/agenda/slots/{slot_id}")
async def deletar_slot(
    slot_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Remove um slot (e seus agendamentos)."""
    if user.role != "empresa":
        raise HTTPException(status_code=403, detail="Apenas empresa pode remover slots")

    slot = db.query(AgendaSlot).filter(
        AgendaSlot.id == slot_id,
        AgendaSlot.empresa_id == empresa_id
    ).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    slot_data = slot.data
    db.delete(slot)
    db.commit()
    _invalidar_dia(_redis(), empresa_id, slot_data)
    return {"message": "Slot removido"}


# ─── Agendamentos ──────────────────────────────────────────────────────────────

@router.get("/agenda/agendamentos")
async def listar_agendamentos(
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
):
    """Lista agendamentos da empresa com filtros."""
    query = db.query(AgendaAgendamento).join(AgendaSlot).filter(
        AgendaAgendamento.empresa_id == empresa_id
    )

    if status:
        query = query.filter(AgendaAgendamento.status == status)
    if data_inicio:
        query = query.filter(AgendaSlot.data >= date.fromisoformat(data_inicio))
    if data_fim:
        query = query.filter(AgendaSlot.data <= date.fromisoformat(data_fim))

    agendamentos = query.order_by(AgendaSlot.data, AgendaSlot.hora_inicio).all()

    return [
        {
            "id": ag.id,
            "slot_id": ag.slot_id,
            "data": str(ag.slot.data),
            "hora_inicio": ag.slot.hora_inicio,
            "hora_fim": ag.slot.hora_fim,
            "whatsapp_number": ag.whatsapp_number,
            "nome_cliente": ag.nome_cliente,
            "status": ag.status,
            "observacoes": ag.observacoes,
            "criado_em": ag.criado_em.isoformat() if ag.criado_em else None,
        }
        for ag in agendamentos
    ]


@router.post("/agenda/agendamentos", status_code=201)
async def criar_agendamento(
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Cria um agendamento em um slot."""
    slot_id = dados.get("slot_id")
    if not slot_id:
        raise HTTPException(status_code=400, detail="slot_id obrigatório")

    # SELECT FOR UPDATE: lock contra race condition
    slot = db.query(AgendaSlot).filter(
        AgendaSlot.id == slot_id,
        AgendaSlot.empresa_id == empresa_id
    ).with_for_update().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    # Validação: não permitir agendamento em data passada
    if slot.data < _hoje():
        raise HTTPException(status_code=400, detail="Não é possível agendar em datas passadas")

    if slot.status == 'bloqueado':
        raise HTTPException(status_code=400, detail="Slot bloqueado")
    if slot.vagas_ocupadas >= slot.vagas_total:
        raise HTTPException(status_code=400, detail="Slot sem vagas disponíveis")

    # Buscar dados do cliente
    whatsapp = dados.get("whatsapp_number", "")
    nome = dados.get("nome_cliente")
    cliente_id = dados.get("cliente_id")

    if not nome and whatsapp:
        cliente = db.query(Cliente).filter(
            Cliente.empresa_id == empresa_id,
            Cliente.whatsapp_number == whatsapp
        ).first()
        if cliente:
            nome = cliente.nome_completo
            cliente_id = cliente.id

    # Proteção anti-duplicata: mesmo cliente no mesmo slot
    if whatsapp:
        agendamento_existente = db.query(AgendaAgendamento).filter(
            AgendaAgendamento.slot_id == slot_id,
            AgendaAgendamento.whatsapp_number == whatsapp,
            AgendaAgendamento.status != 'cancelado',
        ).first()
        if agendamento_existente:
            raise HTTPException(
                status_code=400,
                detail="Este cliente já possui um agendamento neste horário"
            )

    ag = AgendaAgendamento(
        empresa_id=empresa_id,
        slot_id=slot_id,
        cliente_id=cliente_id,
        whatsapp_number=whatsapp,
        nome_cliente=nome,
        status=dados.get("status", "confirmado"),
        observacoes=dados.get("observacoes"),
    )
    db.add(ag)

    # Atualizar vagas
    slot.vagas_ocupadas += 1
    if slot.vagas_ocupadas >= slot.vagas_total:
        slot.status = 'lotado'

    db.commit()
    db.refresh(ag)
    _invalidar_dia(_redis(), empresa_id, slot.data)
    return {"id": ag.id, "message": "Agendamento criado"}


@router.patch("/agenda/agendamentos/{agendamento_id}")
async def atualizar_agendamento(
    agendamento_id: int,
    dados: dict,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Atualiza status ou observações de um agendamento."""
    ag = db.query(AgendaAgendamento).filter(
        AgendaAgendamento.id == agendamento_id,
        AgendaAgendamento.empresa_id == empresa_id
    ).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    status_anterior = ag.status
    novo_status = dados.get("status", ag.status)

    if "status" in dados:
        ag.status = novo_status
    if "observacoes" in dados:
        ag.observacoes = dados["observacoes"]

    # Se cancelou, libera vaga (com lock no slot)
    if novo_status == 'cancelado' and status_anterior != 'cancelado':
        slot = db.query(AgendaSlot).filter(
            AgendaSlot.id == ag.slot_id
        ).with_for_update().first()
        if slot:
            slot.vagas_ocupadas = max(0, slot.vagas_ocupadas - 1)
            if slot.status == 'lotado':
                slot.status = 'disponivel'

    ag_slot_data = ag.slot.data
    db.commit()
    _invalidar_dia(_redis(), empresa_id, ag_slot_data)
    return {"message": "Agendamento atualizado"}


@router.delete("/agenda/agendamentos/{agendamento_id}")
async def deletar_agendamento(
    agendamento_id: int,
    user: CurrentUser,
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db)
):
    """Remove um agendamento e libera a vaga."""
    ag = db.query(AgendaAgendamento).filter(
        AgendaAgendamento.id == agendamento_id,
        AgendaAgendamento.empresa_id == empresa_id
    ).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    if ag.status != 'cancelado':
        slot = db.query(AgendaSlot).filter(
            AgendaSlot.id == ag.slot_id
        ).with_for_update().first()
        if slot:
            slot.vagas_ocupadas = max(0, slot.vagas_ocupadas - 1)
            if slot.status == 'lotado':
                slot.status = 'disponivel'

    ag_slot_data = ag.slot.data
    db.delete(ag)
    db.commit()
    _invalidar_dia(_redis(), empresa_id, ag_slot_data)
    return {"message": "Agendamento removido"}
