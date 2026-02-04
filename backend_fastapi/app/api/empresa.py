"""
Endpoints para Dashboard da Empresa
Métricas, aniversários, atendentes, gerenciamento
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, or_
from typing import List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel

from app.database.database import get_db
from app.models.models import (
    Atendimento, Atendente, Cliente, MensagemLog
)
from app.core.dependencies import CurrentEmpresa, EmpresaIdFromToken

router = APIRouter()


# ========== SCHEMAS ==========

class MetricasResponse(BaseModel):
    """Response com métricas do dashboard"""
    total_conversas: int
    conversas_ativas: int
    atendentes_online: int
    total_atendentes: int
    taxa_resposta_media: float  # em minutos
    mensagens_enviadas: int
    mensagens_recebidas: int

    class Config:
        from_attributes = True


class AniversarianteResponse(BaseModel):
    """Aniversariante (cliente ou atendente)"""
    id: int
    nome: str
    tipo: str  # 'cliente' ou 'atendente'
    data_nascimento: date
    dia_mes: int
    whatsapp: Optional[str] = None

    class Config:
        from_attributes = True


class AtendenteStatusResponse(BaseModel):
    """Atendente com status e estatísticas"""
    id: int
    nome_exibicao: str
    email: Optional[str]
    status: str  # online, offline, ausente
    foto_url: Optional[str]
    total_chats_ativos: int
    ultima_atividade: Optional[datetime]
    pode_atender: bool

    class Config:
        from_attributes = True


class GraficoAtendimentosResponse(BaseModel):
    """Dados para gráfico de atendimentos"""
    labels: List[str]
    valores: List[int]


# ========== ENDPOINTS ==========

@router.get("/empresa/metricas", response_model=MetricasResponse)
async def obter_metricas_dashboard(
    empresa_id: CurrentEmpresa,
    periodo: str = "dia",  # dia, semana, mes, ano
    db: Session = Depends(get_db)
):
    """
    Retorna métricas para o dashboard da empresa

    Períodos:
    - dia: Últimas 24 horas
    - semana: Últimos 7 dias
    - mes: Últimos 30 dias
    - ano: Últimos 365 dias
    """
    # Calcular data inicial baseada no período
    now = datetime.now()
    if periodo == "dia":
        data_inicial = now - timedelta(days=1)
    elif periodo == "semana":
        data_inicial = now - timedelta(days=7)
    elif periodo == "mes":
        data_inicial = now - timedelta(days=30)
    elif periodo == "ano":
        data_inicial = now - timedelta(days=365)
    else:
        data_inicial = now - timedelta(days=1)

    # Total de conversas no período
    total_conversas = db.query(Atendimento).join(
        Atendente, Atendimento.atendente_id == Atendente.id
    ).filter(
        Atendente.empresa_id == empresa_id,
        Atendimento.iniciado_em >= data_inicial
    ).count()

    # Conversas ativas (não finalizadas)
    conversas_ativas = db.query(Atendimento).join(
        Atendente, Atendimento.atendente_id == Atendente.id
    ).filter(
        Atendente.empresa_id == empresa_id,
        Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])
    ).count()

    # Atendentes online
    atendentes_online = db.query(Atendente).filter(
        Atendente.empresa_id == empresa_id,
        Atendente.status == 'online',
        Atendente.pode_atender == True
    ).count()

    # Total de atendentes
    total_atendentes = db.query(Atendente).filter(
        Atendente.empresa_id == empresa_id
    ).count()

    # Mensagens enviadas e recebidas no período
    mensagens_enviadas = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == 'enviada',
        MensagemLog.timestamp >= data_inicial
    ).count()

    mensagens_recebidas = db.query(MensagemLog).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.direcao == 'recebida',
        MensagemLog.timestamp >= data_inicial
    ).count()

    # Taxa de resposta média (simplificado - tempo entre recebida e enviada)
    # TODO: Melhorar este cálculo para ser mais preciso
    taxa_resposta_media = 2.5  # Mock: 2.5 minutos

    return MetricasResponse(
        total_conversas=total_conversas,
        conversas_ativas=conversas_ativas,
        atendentes_online=atendentes_online,
        total_atendentes=total_atendentes,
        taxa_resposta_media=taxa_resposta_media,
        mensagens_enviadas=mensagens_enviadas,
        mensagens_recebidas=mensagens_recebidas
    )


@router.get("/empresa/aniversarios", response_model=List[AniversarianteResponse])
async def listar_aniversarios_mes(
    empresa_id: CurrentEmpresa,
    mes: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Lista aniversariantes do mês (clientes e atendentes)

    Args:
        mes: Mês (1-12). Se não informado, usa mês atual
    """
    if mes is None:
        mes = datetime.now().month

    aniversariantes = []

    # Buscar atendentes aniversariantes
    atendentes = db.query(Atendente).filter(
        Atendente.empresa_id == empresa_id,
        Atendente.data_nascimento.isnot(None),
        extract('month', Atendente.data_nascimento) == mes
    ).all()

    for atendente in atendentes:
        aniversariantes.append(AniversarianteResponse(
            id=atendente.id,
            nome=atendente.nome_exibicao,
            tipo='atendente',
            data_nascimento=atendente.data_nascimento,
            dia_mes=atendente.data_nascimento.day,
            whatsapp=None
        ))

    # Buscar clientes aniversariantes
    clientes = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.data_nascimento.isnot(None),
        extract('month', Cliente.data_nascimento) == mes
    ).all()

    for cliente in clientes:
        aniversariantes.append(AniversarianteResponse(
            id=cliente.id,
            nome=cliente.nome_completo,
            tipo='cliente',
            data_nascimento=cliente.data_nascimento,
            dia_mes=cliente.data_nascimento.day,
            whatsapp=cliente.whatsapp_number
        ))

    # Ordenar por dia do mês
    aniversariantes.sort(key=lambda x: x.dia_mes)

    return aniversariantes


@router.get("/empresa/atendentes", response_model=List[AtendenteStatusResponse])
async def listar_atendentes_empresa(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """
    Lista todos os atendentes da empresa com status e estatísticas
    """
    atendentes = db.query(Atendente).filter(
        Atendente.empresa_id == empresa_id
    ).all()

    resultado = []

    for atendente in atendentes:
        # Contar chats ativos do atendente
        total_chats = db.query(Atendimento).filter(
            Atendimento.atendente_id == atendente.id,
            Atendimento.status.in_(['em_atendimento', 'aguardando'])
        ).count()

        resultado.append(AtendenteStatusResponse(
            id=atendente.id,
            nome_exibicao=atendente.nome_exibicao,
            email=atendente.email,
            status=atendente.status,
            foto_url=atendente.foto_url,
            total_chats_ativos=total_chats,
            ultima_atividade=atendente.ultima_atividade,
            pode_atender=atendente.pode_atender
        ))

    return resultado


@router.get("/empresa/grafico-atendimentos", response_model=GraficoAtendimentosResponse)
async def obter_dados_grafico(
    empresa_id: CurrentEmpresa,
    periodo: str = "semana",  # dia, semana, mes
    db: Session = Depends(get_db)
):
    """
    Retorna dados para gráfico de atendimentos por período

    - dia: Últimas 24 horas (por hora)
    - semana: Últimos 7 dias (por dia)
    - mes: Últimos 30 dias (por dia)
    """
    now = datetime.now()
    labels = []
    valores = []

    if periodo == "semana":
        # Últimos 7 dias
        for i in range(6, -1, -1):
            data = now - timedelta(days=i)
            data_inicio = data.replace(hour=0, minute=0, second=0)
            data_fim = data.replace(hour=23, minute=59, second=59)

            count = db.query(Atendimento).join(
                Atendente, Atendimento.atendente_id == Atendente.id
            ).filter(
                Atendente.empresa_id == empresa_id,
                Atendimento.iniciado_em >= data_inicio,
                Atendimento.iniciado_em <= data_fim
            ).count()

            # Label: Seg, Ter, Qua, etc
            dias_semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
            labels.append(dias_semana[data.weekday()])
            valores.append(count)

    elif periodo == "mes":
        # Últimos 30 dias (agrupado de 5 em 5 dias)
        for i in range(5, -1, -1):
            inicio = now - timedelta(days=(i+1)*5)
            fim = now - timedelta(days=i*5)

            count = db.query(Atendimento).join(
                Atendente, Atendimento.atendente_id == Atendente.id
            ).filter(
                Atendente.empresa_id == empresa_id,
                Atendimento.iniciado_em >= inicio,
                Atendimento.iniciado_em < fim
            ).count()

            labels.append(f"{inicio.day}-{fim.day}")
            valores.append(count)

    else:  # dia
        # Últimas 24 horas (de 4 em 4 horas)
        for i in range(5, -1, -1):
            hora_inicio = now - timedelta(hours=(i+1)*4)
            hora_fim = now - timedelta(hours=i*4)

            count = db.query(Atendimento).join(
                Atendente, Atendimento.atendente_id == Atendente.id
            ).filter(
                Atendente.empresa_id == empresa_id,
                Atendimento.iniciado_em >= hora_inicio,
                Atendimento.iniciado_em < hora_fim
            ).count()

            labels.append(f"{hora_inicio.hour}h")
            valores.append(count)

    return GraficoAtendimentosResponse(
        labels=labels,
        valores=valores
    )
