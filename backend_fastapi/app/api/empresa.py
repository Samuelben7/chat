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
    Atendimento, Atendente, Cliente, MensagemLog,
    CrmTag, CrmClienteTag, MessageTemplate, ListaContatos
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

    # Conversas: total no período + ativas (single query with conditional count)
    conv_stats = db.query(
        func.count(Atendimento.id).filter(Atendimento.iniciado_em >= data_inicial).label('total'),
        func.count(Atendimento.id).filter(Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])).label('ativas'),
    ).filter(
        Atendimento.empresa_id == empresa_id,
    ).first()
    total_conversas = conv_stats.total if conv_stats else 0
    conversas_ativas = conv_stats.ativas if conv_stats else 0

    # Atendentes: online + total (single query)
    atd_stats = db.query(
        func.count(Atendente.id).label('total'),
        func.count(Atendente.id).filter(
            and_(Atendente.status == 'online', Atendente.pode_atender == True)
        ).label('online'),
    ).filter(Atendente.empresa_id == empresa_id).first()
    total_atendentes = atd_stats.total if atd_stats else 0
    atendentes_online = atd_stats.online if atd_stats else 0

    # Mensagens: enviadas + recebidas (single GROUP BY query)
    msg_stats = db.query(
        MensagemLog.direcao,
        func.count(MensagemLog.id)
    ).filter(
        MensagemLog.empresa_id == empresa_id,
        MensagemLog.timestamp >= data_inicial
    ).group_by(MensagemLog.direcao).all()
    msg_map = dict(msg_stats)
    mensagens_enviadas = msg_map.get('enviada', 0)
    mensagens_recebidas = msg_map.get('recebida', 0)

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

    # Single aggregated query instead of N+1
    chats_por_atendente = dict(
        db.query(
            Atendimento.atendente_id,
            func.count(Atendimento.id)
        ).filter(
            Atendimento.atendente_id.in_([a.id for a in atendentes]),
            Atendimento.status.in_(['em_atendimento', 'aguardando'])
        ).group_by(Atendimento.atendente_id).all()
    )

    from app.core.config import settings
    base_url = settings.PUBLIC_BASE_URL.rstrip('/')

    resultado = []
    for atendente in atendentes:
        foto_url_full = None
        if atendente.foto_url:
            foto_url_full = f"{base_url}/{atendente.foto_url.lstrip('/')}"

        resultado.append(AtendenteStatusResponse(
            id=atendente.id,
            nome_exibicao=atendente.nome_exibicao,
            email=atendente.email,
            status=atendente.status,
            foto_url=foto_url_full,
            total_chats_ativos=chats_por_atendente.get(atendente.id, 0),
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
    valores = []        # conversas abertas por período
    valores_fin = []    # conversas finalizadas por período
    dias_semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

    if periodo == "semana":
        data_inicio = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        rows = db.query(
            func.date(Atendimento.iniciado_em).label('dia'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.iniciado_em >= data_inicio,
        ).group_by(func.date(Atendimento.iniciado_em)).all()
        counts_by_date = {str(r[0]): r[1] for r in rows}

        rows_fin = db.query(
            func.date(Atendimento.finalizado_em).label('dia'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.finalizado_em >= data_inicio,
            Atendimento.status == 'finalizado',
        ).group_by(func.date(Atendimento.finalizado_em)).all()
        fin_by_date = {str(r[0]): r[1] for r in rows_fin}

        for i in range(6, -1, -1):
            data = now - timedelta(days=i)
            labels.append(dias_semana[data.weekday()])
            valores.append(counts_by_date.get(str(data.date()), 0))
            valores_fin.append(fin_by_date.get(str(data.date()), 0))

    elif periodo == "mes":
        data_inicio = now - timedelta(days=30)
        rows = db.query(
            func.date(Atendimento.iniciado_em).label('dia'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.iniciado_em >= data_inicio,
        ).group_by(func.date(Atendimento.iniciado_em)).all()
        counts_by_date = {str(r[0]): r[1] for r in rows}

        rows_fin = db.query(
            func.date(Atendimento.finalizado_em).label('dia'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.finalizado_em >= data_inicio,
            Atendimento.status == 'finalizado',
        ).group_by(func.date(Atendimento.finalizado_em)).all()
        fin_by_date = {str(r[0]): r[1] for r in rows_fin}

        for i in range(5, -1, -1):
            inicio = now - timedelta(days=(i+1)*5)
            fim = now - timedelta(days=i*5)
            total = sum(
                counts_by_date.get(str((inicio + timedelta(days=d)).date()), 0)
                for d in range(5)
            )
            total_fin = sum(
                fin_by_date.get(str((inicio + timedelta(days=d)).date()), 0)
                for d in range(5)
            )
            labels.append(f"{inicio.day}-{fim.day}")
            valores.append(total)
            valores_fin.append(total_fin)

    else:  # dia
        data_inicio = now - timedelta(hours=24)
        rows = db.query(
            extract('hour', Atendimento.iniciado_em).label('hora'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.iniciado_em >= data_inicio,
        ).group_by(extract('hour', Atendimento.iniciado_em)).all()
        counts_by_hour = {int(r[0]): r[1] for r in rows}

        rows_fin = db.query(
            extract('hour', Atendimento.finalizado_em).label('hora'),
            func.count(Atendimento.id),
        ).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.finalizado_em >= data_inicio,
            Atendimento.status == 'finalizado',
        ).group_by(extract('hour', Atendimento.finalizado_em)).all()
        fin_by_hour = {int(r[0]): r[1] for r in rows_fin}

        for i in range(5, -1, -1):
            hora_inicio = now - timedelta(hours=(i+1)*4)
            total = sum(
                counts_by_hour.get(h % 24, 0)
                for h in range(hora_inicio.hour, hora_inicio.hour + 4)
            )
            total_fin = sum(
                fin_by_hour.get(h % 24, 0)
                for h in range(hora_inicio.hour, hora_inicio.hour + 4)
            )
            labels.append(f"{hora_inicio.hour}h")
            valores.append(total)
            valores_fin.append(total_fin)

    return {
        "labels": labels,
        "valores": valores,
        "valores_finalizadas": valores_fin,
    }


@router.get("/empresa/metricas-crm")
async def obter_metricas_crm(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """
    Retorna métricas específicas do CRM para o dashboard.
    """
    # Filtro base: apenas clientes não arquivados (consistente com o Kanban)
    _base = (Cliente.empresa_id == empresa_id) & (Cliente.crm_arquivado == False)

    # Total de leads (clientes) da empresa — excluindo arquivados
    total_leads = db.query(Cliente).filter(_base).count()

    # Leads por etapa do funil — excluindo arquivados
    etapas_query = db.query(
        Cliente.funil_etapa, func.count(Cliente.id)
    ).filter(_base).group_by(Cliente.funil_etapa).all()

    leads_por_etapa = {etapa: count for etapa, count in etapas_query}

    # Valor do pipeline (excluindo fechado e perdido, excluindo arquivados)
    valor_pipeline = db.query(
        func.coalesce(func.sum(Cliente.valor_estimado), 0)
    ).filter(
        _base,
        ~Cliente.funil_etapa.in_(['fechado', 'perdido'])
    ).scalar()

    # Valor fechado — excluindo arquivados
    valor_fechado = db.query(
        func.coalesce(func.sum(Cliente.valor_estimado), 0)
    ).filter(_base, Cliente.funil_etapa == 'fechado').scalar()

    # Leads novos no mês atual — excluindo arquivados
    now = datetime.now()
    primeiro_dia_mes = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    leads_novos_mes = db.query(Cliente).filter(
        _base,
        Cliente.criado_em_crm >= primeiro_dia_mes
    ).count()

    # Taxa de conversão (fechado / total) — excluindo arquivados
    total_fechado = db.query(Cliente).filter(_base, Cliente.funil_etapa == 'fechado').count()
    taxa_conversao = round((total_fechado / total_leads * 100), 2) if total_leads > 0 else 0.0

    # Ticket médio — excluindo arquivados
    ticket_medio = db.query(
        func.coalesce(func.avg(Cliente.valor_estimado), 0)
    ).filter(_base, Cliente.funil_etapa == 'fechado').scalar()

    # Top 5 tags com mais clientes
    top_tags_query = db.query(
        CrmTag.nome, func.count(CrmClienteTag.id).label('total')
    ).join(
        CrmClienteTag, CrmTag.id == CrmClienteTag.tag_id
    ).filter(
        CrmTag.empresa_id == empresa_id
    ).group_by(CrmTag.nome).order_by(
        func.count(CrmClienteTag.id).desc()
    ).limit(5).all()

    top_tags = [{"nome": nome, "total": total} for nome, total in top_tags_query]

    return {
        "total_leads": total_leads,
        "leads_por_etapa": leads_por_etapa,
        "valor_pipeline": float(valor_pipeline),
        "valor_fechado": float(valor_fechado),
        "leads_novos_mes": leads_novos_mes,
        "taxa_conversao": taxa_conversao,
        "ticket_medio": float(ticket_medio),
        "top_tags": top_tags
    }


@router.get("/empresa/metricas-envio")
async def obter_metricas_envio(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """
    Retorna estatísticas de envio em massa para o dashboard.
    """
    # Templates aprovados
    templates_aprovados = db.query(MessageTemplate).filter(
        MessageTemplate.empresa_id == empresa_id,
        MessageTemplate.status == 'APPROVED'
    ).count()

    # Total de contatos (clientes) da empresa
    total_contatos = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id
    ).count()

    # Total de listas de contatos
    total_listas = db.query(ListaContatos).filter(
        ListaContatos.empresa_id == empresa_id
    ).count()

    return {
        "templates_aprovados": templates_aprovados,
        "total_contatos": total_contatos,
        "total_listas": total_listas
    }


@router.get("/empresa/metricas-satisfacao")
async def obter_metricas_satisfacao(
    empresa_id: CurrentEmpresa,
    db: Session = Depends(get_db)
):
    """
    Retorna métricas de satisfação dos clientes.
    - Média geral, distribuição por nota
    - Satisfação por atendente
    - Satisfação da empresa (quando atende sem atendente)
    """
    # Base query: atendimentos finalizados COM nota de satisfação
    base = db.query(Atendimento).filter(
        Atendimento.empresa_id == empresa_id,
        Atendimento.nota_satisfacao.isnot(None),
        Atendimento.status == 'finalizado'
    )

    total_avaliacoes = base.count()

    if total_avaliacoes == 0:
        return {
            "total_avaliacoes": 0,
            "media_geral": 0,
            "distribuicao": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            "por_atendente": [],
            "empresa": {"total": 0, "media": 0},
        }

    # Média geral
    media_geral = db.query(func.avg(Atendimento.nota_satisfacao)).filter(
        Atendimento.empresa_id == empresa_id,
        Atendimento.nota_satisfacao.isnot(None),
        Atendimento.status == 'finalizado'
    ).scalar() or 0

    # Distribuição por nota
    distribuicao = {}
    for nota in range(1, 6):
        count = base.filter(Atendimento.nota_satisfacao == nota).count()
        distribuicao[nota] = count

    # Satisfação por atendente
    por_atendente_raw = db.query(
        Atendente.id,
        Atendente.nome_exibicao,
        Atendente.foto_url,
        func.avg(Atendimento.nota_satisfacao).label('media'),
        func.count(Atendimento.id).label('total'),
    ).join(
        Atendimento, Atendimento.atendente_id == Atendente.id
    ).filter(
        Atendimento.empresa_id == empresa_id,
        Atendimento.nota_satisfacao.isnot(None),
        Atendimento.status == 'finalizado',
        Atendimento.atendido_por_ia == False
    ).group_by(Atendente.id, Atendente.nome_exibicao, Atendente.foto_url).all()

    por_atendente = []
    for row in por_atendente_raw:
        # Distribuição individual
        dist_atd = {}
        for n in range(1, 6):
            cnt = db.query(Atendimento).filter(
                Atendimento.empresa_id == empresa_id,
                Atendimento.atendente_id == row.id,
                Atendimento.nota_satisfacao == n,
                Atendimento.status == 'finalizado',
                Atendimento.atendido_por_ia == False
            ).count()
            dist_atd[n] = cnt

        foto_url_full = None
        if row.foto_url:
            from app.core.config import settings
            base_url_m = settings.PUBLIC_BASE_URL.rstrip('/')
            foto_url_full = f"{base_url_m}/{row.foto_url.lstrip('/')}"

        por_atendente.append({
            "id": row.id,
            "nome": row.nome_exibicao,
            "foto_url": foto_url_full,
            "media": round(float(row.media), 1),
            "total": row.total,
            "distribuicao": dist_atd,
        })

    # Satisfação da empresa (atendimento sem atendente_id)
    empresa_total = base.filter(Atendimento.atendente_id.is_(None)).count()
    empresa_media = 0
    if empresa_total > 0:
        empresa_media = db.query(func.avg(Atendimento.nota_satisfacao)).filter(
            Atendimento.empresa_id == empresa_id,
            Atendimento.atendente_id.is_(None),
            Atendimento.nota_satisfacao.isnot(None),
            Atendimento.status == 'finalizado'
        ).scalar() or 0

    return {
        "total_avaliacoes": total_avaliacoes,
        "media_geral": round(float(media_geral), 1),
        "distribuicao": distribuicao,
        "por_atendente": sorted(por_atendente, key=lambda x: x["media"], reverse=True),
        "empresa": {
            "total": empresa_total,
            "media": round(float(empresa_media), 1),
        },
    }
