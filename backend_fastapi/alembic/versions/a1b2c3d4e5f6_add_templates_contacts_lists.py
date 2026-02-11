"""add_templates_contacts_lists

Revision ID: a1b2c3d4e5f6
Revises: 47bb76bad1f4
Create Date: 2026-02-10 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '47bb76bad1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adicionar waba_id na tabela empresa
    op.add_column('empresa', sa.Column('waba_id', sa.String(50), nullable=True))
    op.create_index('ix_empresa_waba_id', 'empresa', ['waba_id'])

    # Criar tabela message_template
    op.create_table(
        'message_template',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False),
        sa.Column('meta_template_id', sa.String(100), nullable=True),
        sa.Column('waba_id', sa.String(50), nullable=True),
        sa.Column('name', sa.String(512), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('language', sa.String(10), nullable=False, server_default='pt_BR'),
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('components', sa.JSON(), nullable=True, server_default='[]'),
        sa.Column('parameter_format', sa.String(20), nullable=True),
        sa.Column('quality_score', sa.String(20), nullable=True),
        sa.Column('rejected_reason', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_message_template_id', 'message_template', ['id'])
    op.create_index('ix_message_template_empresa_id', 'message_template', ['empresa_id'])
    op.create_index(
        'idx_template_empresa_name_lang',
        'message_template',
        ['empresa_id', 'name', 'language'],
        unique=True
    )
    op.create_index(
        'idx_template_empresa_status',
        'message_template',
        ['empresa_id', 'status']
    )

    # Criar tabela lista_contatos
    op.create_table(
        'lista_contatos',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresa.id', ondelete='CASCADE'), nullable=False),
        sa.Column('nome', sa.String(255), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('cor', sa.String(7), nullable=True, server_default='#3B82F6'),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_lista_contatos_id', 'lista_contatos', ['id'])
    op.create_index('ix_lista_contatos_empresa_id', 'lista_contatos', ['empresa_id'])

    # Criar tabela lista_contatos_membro
    op.create_table(
        'lista_contatos_membro',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('lista_id', sa.Integer(), sa.ForeignKey('lista_contatos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('whatsapp_bot_cliente.id', ondelete='SET NULL'), nullable=True),
        sa.Column('whatsapp_number', sa.String(20), nullable=False),
        sa.Column('nome', sa.String(255), nullable=True),
        sa.Column('adicionado_em', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_lista_contatos_membro_id', 'lista_contatos_membro', ['id'])
    op.create_index('ix_lista_contatos_membro_lista_id', 'lista_contatos_membro', ['lista_id'])
    op.create_index(
        'idx_lista_membro_unico',
        'lista_contatos_membro',
        ['lista_id', 'whatsapp_number'],
        unique=True
    )


def downgrade() -> None:
    # Remover tabela lista_contatos_membro
    op.drop_index('idx_lista_membro_unico', 'lista_contatos_membro')
    op.drop_index('ix_lista_contatos_membro_lista_id', 'lista_contatos_membro')
    op.drop_index('ix_lista_contatos_membro_id', 'lista_contatos_membro')
    op.drop_table('lista_contatos_membro')

    # Remover tabela lista_contatos
    op.drop_index('ix_lista_contatos_empresa_id', 'lista_contatos')
    op.drop_index('ix_lista_contatos_id', 'lista_contatos')
    op.drop_table('lista_contatos')

    # Remover tabela message_template
    op.drop_index('idx_template_empresa_status', 'message_template')
    op.drop_index('idx_template_empresa_name_lang', 'message_template')
    op.drop_index('ix_message_template_empresa_id', 'message_template')
    op.drop_index('ix_message_template_id', 'message_template')
    op.drop_table('message_template')

    # Remover waba_id da tabela empresa
    op.drop_index('ix_empresa_waba_id', 'empresa')
    op.drop_column('empresa', 'waba_id')
