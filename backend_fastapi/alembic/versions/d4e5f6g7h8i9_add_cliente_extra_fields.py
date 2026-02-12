"""add_cliente_extra_fields

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-02-12 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dados pessoais
    op.add_column('whatsapp_bot_cliente', sa.Column('rg', sa.String(20), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('telefone_secundario', sa.String(20), nullable=True))

    # Endereco completo
    op.add_column('whatsapp_bot_cliente', sa.Column('bairro', sa.String(100), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('estado', sa.String(50), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('pais', sa.String(100), nullable=True))

    # Profissional / Financeiro
    op.add_column('whatsapp_bot_cliente', sa.Column('profissao', sa.String(100), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('empresa_cliente', sa.String(255), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('chave_pix', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('whatsapp_bot_cliente', 'chave_pix')
    op.drop_column('whatsapp_bot_cliente', 'empresa_cliente')
    op.drop_column('whatsapp_bot_cliente', 'profissao')
    op.drop_column('whatsapp_bot_cliente', 'pais')
    op.drop_column('whatsapp_bot_cliente', 'estado')
    op.drop_column('whatsapp_bot_cliente', 'bairro')
    op.drop_column('whatsapp_bot_cliente', 'telefone_secundario')
    op.drop_column('whatsapp_bot_cliente', 'rg')
