"""P2: empresa_id + protocolo + motivo_encerramento em Atendimento

Revision ID: e1f2g3h4i5j6
Revises: d4e5f6g7h8i9
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2g3h4i5j6'
down_revision = 'd4e5f6g7h8i9'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    def column_exists(table, column):
        result = conn.execute(sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": column})
        return result.scalar() > 0

    # 1. empresa_id
    if not column_exists('painel_atendimento', 'empresa_id'):
        op.add_column('painel_atendimento',
            sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id'), nullable=True))

    # 2. Protocolo único de atendimento
    if not column_exists('painel_atendimento', 'protocolo'):
        op.add_column('painel_atendimento',
            sa.Column('protocolo', sa.String(10), nullable=True))

    # 3. Motivo e observação (podem já existir de migration anterior)
    if not column_exists('painel_atendimento', 'motivo_encerramento'):
        op.add_column('painel_atendimento',
            sa.Column('motivo_encerramento', sa.String(100), nullable=True))
    if not column_exists('painel_atendimento', 'observacao_encerramento'):
        op.add_column('painel_atendimento',
            sa.Column('observacao_encerramento', sa.Text(), nullable=True))

    # 4. Backfill empresa_id via atendente
    op.execute("""
        UPDATE painel_atendimento pa
        SET empresa_id = (
            SELECT a.empresa_id FROM painel_atendente a WHERE a.id = pa.atendente_id
        )
        WHERE pa.atendente_id IS NOT NULL AND pa.empresa_id IS NULL
    """)

    # 5. Backfill empresa_id restante via mensagem log
    op.execute("""
        UPDATE painel_atendimento pa
        SET empresa_id = (
            SELECT ml.empresa_id FROM whatsapp_bot_mensagemlog ml
            WHERE ml.whatsapp_number = pa.whatsapp_number
            LIMIT 1
        )
        WHERE pa.empresa_id IS NULL
    """)

    # 6. Fallback para empresa_id=1 se ainda nulo
    op.execute("UPDATE painel_atendimento SET empresa_id = 1 WHERE empresa_id IS NULL")

    # 7. Índice para empresa_id
    op.create_index('idx_atendimento_empresa', 'painel_atendimento', ['empresa_id'])

    # 8. Índice único para protocolo (quando preenchido)
    op.create_index('idx_atendimento_protocolo', 'painel_atendimento', ['protocolo'],
                    unique=True, postgresql_where=sa.text("protocolo IS NOT NULL"))


def downgrade():
    op.drop_index('idx_atendimento_protocolo', 'painel_atendimento')
    op.drop_index('idx_atendimento_empresa', 'painel_atendimento')
    op.drop_column('painel_atendimento', 'observacao_encerramento')
    op.drop_column('painel_atendimento', 'motivo_encerramento')
    op.drop_column('painel_atendimento', 'protocolo')
    op.drop_column('painel_atendimento', 'empresa_id')
