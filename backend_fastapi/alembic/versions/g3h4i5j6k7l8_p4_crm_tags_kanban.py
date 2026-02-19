"""P4: CRM Completo - campos funil, tags e kanban

Revision ID: g3h4i5j6k7l8
Revises: f2g3h4i5j6k7
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'g3h4i5j6k7l8'
down_revision = 'f2g3h4i5j6k7'
branch_labels = None
depends_on = None


def column_exists(conn, table, column):
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column})
    return result.scalar() > 0


def table_exists(conn, table):
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table})
    return result.scalar() > 0


def upgrade():
    conn = op.get_bind()

    # 1. Adicionar campos CRM ao Cliente
    crm_columns = [
        ('funil_etapa', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN funil_etapa VARCHAR(30) DEFAULT 'novo_lead'"),
        ('valor_estimado', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN valor_estimado NUMERIC(12,2)"),
        ('responsavel_id', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN responsavel_id INTEGER REFERENCES atendente(id) ON DELETE SET NULL"),
        ('resumo_conversa', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN resumo_conversa TEXT"),
        ('preferencias', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN preferencias TEXT"),
        ('observacoes_crm', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN observacoes_crm TEXT"),
        ('criado_em_crm', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN criado_em_crm TIMESTAMP DEFAULT NOW()"),
        ('atualizado_em_crm', "ALTER TABLE whatsapp_bot_cliente ADD COLUMN atualizado_em_crm TIMESTAMP DEFAULT NOW()"),
    ]
    for col, sql in crm_columns:
        if not column_exists(conn, 'whatsapp_bot_cliente', col):
            conn.execute(sa.text(sql))

    # 2. Tabela de Tags
    if not table_exists(conn, 'crm_tag'):
        op.create_table(
            'crm_tag',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False),
            sa.Column('nome', sa.String(50), nullable=False),
            sa.Column('cor', sa.String(7), default='#3B82F6'),   # hex color
            sa.Column('emoji', sa.String(10), nullable=True),
            sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_crm_tag_empresa', 'crm_tag', ['empresa_id'])

    # 3. Tabela de relacionamento Cliente <-> Tag
    if not table_exists(conn, 'crm_cliente_tag'):
        op.create_table(
            'crm_cliente_tag',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False),
            sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('whatsapp_bot_cliente.id', ondelete='CASCADE'), nullable=False),
            sa.Column('tag_id', sa.Integer(), sa.ForeignKey('crm_tag.id', ondelete='CASCADE'), nullable=False),
            sa.Column('adicionado_em', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_crm_cliente_tag_cliente', 'crm_cliente_tag', ['cliente_id'])
        op.create_index('idx_crm_cliente_tag_unico', 'crm_cliente_tag', ['cliente_id', 'tag_id'], unique=True)


def downgrade():
    op.drop_table('crm_cliente_tag')
    op.drop_table('crm_tag')
    for col in ['funil_etapa', 'valor_estimado', 'responsavel_id', 'resumo_conversa',
                'preferencias', 'observacoes_crm', 'criado_em_crm', 'atualizado_em_crm']:
        op.drop_column('whatsapp_bot_cliente', col)
