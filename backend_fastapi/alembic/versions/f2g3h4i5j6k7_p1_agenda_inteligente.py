"""P1: Agenda Inteligente - horarios, slots e agendamentos

Revision ID: f2g3h4i5j6k7
Revises: e1f2g3h4i5j6
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'f2g3h4i5j6k7'
down_revision = 'e1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    def table_exists(table):
        result = conn.execute(sa.text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_name=:t"
        ), {"t": table})
        return result.scalar() > 0

    # 1. Horários de funcionamento por dia da semana
    if not table_exists('agenda_horario_funcionamento'):
        op.create_table(
            'agenda_horario_funcionamento',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id'), nullable=False),
            sa.Column('dia_semana', sa.Integer(), nullable=False),  # 0=dom .. 6=sab
            sa.Column('hora_inicio', sa.String(5), nullable=False),  # HH:MM
            sa.Column('hora_fim', sa.String(5), nullable=False),
            sa.Column('intervalo_minutos', sa.Integer(), default=60),
            sa.Column('vagas_por_slot', sa.Integer(), default=1),
            sa.Column('ativo', sa.Boolean(), default=True),
        )
        op.create_index('idx_horario_empresa', 'agenda_horario_funcionamento', ['empresa_id'])

    # 2. Slots individuais de tempo
    if not table_exists('agenda_slot'):
        op.create_table(
            'agenda_slot',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id'), nullable=False),
            sa.Column('data', sa.Date(), nullable=False),
            sa.Column('hora_inicio', sa.String(5), nullable=False),
            sa.Column('hora_fim', sa.String(5), nullable=False),
            sa.Column('vagas_total', sa.Integer(), default=1),
            sa.Column('vagas_ocupadas', sa.Integer(), default=0),
            sa.Column('status', sa.String(20), default='disponivel'),  # disponivel/lotado/bloqueado
            sa.Column('observacao', sa.Text(), nullable=True),
            sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_slot_empresa_data', 'agenda_slot', ['empresa_id', 'data'])

    # 3. Agendamentos (clientes em slots)
    if not table_exists('agenda_agendamento'):
        op.create_table(
            'agenda_agendamento',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id'), nullable=False),
            sa.Column('slot_id', sa.Integer(), sa.ForeignKey('agenda_slot.id'), nullable=False),
            sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('whatsapp_bot_cliente.id'), nullable=True),
            sa.Column('whatsapp_number', sa.String(20), nullable=False),
            sa.Column('nome_cliente', sa.String(150), nullable=True),
            sa.Column('status', sa.String(20), default='confirmado'),  # pendente/confirmado/cancelado/realizado
            sa.Column('observacoes', sa.Text(), nullable=True),
            sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('atualizado_em', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
        op.create_index('idx_agendamento_slot', 'agenda_agendamento', ['slot_id'])
        op.create_index('idx_agendamento_empresa', 'agenda_agendamento', ['empresa_id'])


def downgrade():
    op.drop_table('agenda_agendamento')
    op.drop_table('agenda_slot')
    op.drop_table('agenda_horario_funcionamento')
