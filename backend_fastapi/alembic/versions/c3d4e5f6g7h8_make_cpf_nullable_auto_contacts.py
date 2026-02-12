"""make_cpf_nullable_auto_contacts

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-12 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make cpf nullable (for auto-created contacts)
    op.alter_column('whatsapp_bot_cliente', 'cpf',
                     existing_type=sa.String(14),
                     nullable=True)

    # Add email column to Cliente (for coletar_dado)
    op.add_column('whatsapp_bot_cliente', sa.Column('email', sa.String(255), nullable=True))

    # Drop the unique constraint on (empresa_id, cpf) since cpf can now be null
    # and recreate it allowing nulls
    try:
        op.drop_index('idx_empresa_cpf', table_name='whatsapp_bot_cliente')
    except:
        pass  # Index may not exist

    # Create new index that allows null CPF (non-unique for null values)
    op.create_index(
        'idx_empresa_cpf',
        'whatsapp_bot_cliente',
        ['empresa_id', 'cpf'],
        unique=False  # Changed to non-unique since cpf can be null
    )


def downgrade() -> None:
    op.drop_column('whatsapp_bot_cliente', 'email')

    try:
        op.drop_index('idx_empresa_cpf', table_name='whatsapp_bot_cliente')
    except:
        pass

    op.alter_column('whatsapp_bot_cliente', 'cpf',
                     existing_type=sa.String(14),
                     nullable=False)

    op.create_index(
        'idx_empresa_cpf',
        'whatsapp_bot_cliente',
        ['empresa_id', 'cpf'],
        unique=True
    )
