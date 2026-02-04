"""add_authentication_tables_and_fields

Revision ID: 47bb76bad1f4
Revises: 25df3d127c72
Create Date: 2026-01-24 21:09:11.582955

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47bb76bad1f4'
down_revision: Union[str, None] = '25df3d127c72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adicionar campos na tabela empresa
    op.add_column('empresa', sa.Column('admin_email', sa.String(255), nullable=True, unique=True))
    op.add_column('empresa', sa.Column('admin_senha_hash', sa.String(255), nullable=True))

    # Adicionar campos na tabela whatsapp_bot_cliente
    op.add_column('whatsapp_bot_cliente', sa.Column('data_nascimento', sa.Date(), nullable=True))
    op.add_column('whatsapp_bot_cliente', sa.Column('foto_url', sa.String(500), nullable=True))

    # Adicionar campos na tabela painel_atendente
    op.add_column('painel_atendente', sa.Column('data_nascimento', sa.Date(), nullable=True))
    op.add_column('painel_atendente', sa.Column('cpf', sa.String(14), nullable=True, unique=True))
    op.add_column('painel_atendente', sa.Column('foto_url', sa.String(500), nullable=True))

    # Criar tabela empresa_auth
    op.create_table(
        'empresa_auth',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('senha_hash', sa.String(255), nullable=False),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('ultimo_login', sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index('ix_empresa_auth_email', 'empresa_auth', ['email'])
    op.create_index('ix_empresa_auth_empresa_id', 'empresa_auth', ['empresa_id'])

    # Criar tabela atendente_auth
    op.create_table(
        'atendente_auth',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('atendente_id', sa.Integer(), sa.ForeignKey('painel_atendente.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('senha_hash', sa.String(255), nullable=False),
        sa.Column('primeiro_login', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('ultimo_login', sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index('ix_atendente_auth_email', 'atendente_auth', ['email'])
    op.create_index('ix_atendente_auth_atendente_id', 'atendente_auth', ['atendente_id'])


def downgrade() -> None:
    # Remover tabelas
    op.drop_index('ix_atendente_auth_atendente_id', 'atendente_auth')
    op.drop_index('ix_atendente_auth_email', 'atendente_auth')
    op.drop_table('atendente_auth')

    op.drop_index('ix_empresa_auth_empresa_id', 'empresa_auth')
    op.drop_index('ix_empresa_auth_email', 'empresa_auth')
    op.drop_table('empresa_auth')

    # Remover campos da tabela painel_atendente
    op.drop_column('painel_atendente', 'foto_url')
    op.drop_column('painel_atendente', 'cpf')
    op.drop_column('painel_atendente', 'data_nascimento')

    # Remover campos da tabela whatsapp_bot_cliente
    op.drop_column('whatsapp_bot_cliente', 'foto_url')
    op.drop_column('whatsapp_bot_cliente', 'data_nascimento')

    # Remover campos da tabela empresa
    op.drop_column('empresa', 'admin_senha_hash')
    op.drop_column('empresa', 'admin_email')
