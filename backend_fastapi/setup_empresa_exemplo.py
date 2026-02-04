"""
Script de exemplo para cadastrar empresa e dados iniciais no sistema multi-tenant.
Execute após aplicar migrations: alembic upgrade head
"""
import asyncio
from sqlalchemy.orm import Session
from app.database.database import SessionLocal
from app.models.models import Empresa, TipoServico, VagaAgenda, ConfiguracaoBot, Atendente
from datetime import date, timedelta


def criar_empresa_exemplo(db: Session) -> Empresa:
    """Cria empresa de exemplo."""
    print("📝 Cadastrando empresa...")

    empresa = Empresa(
        nome="Construtora ABC Ltda",
        cnpj="12.345.678/0001-90",
        email="contato@construtoraabc.com.br",
        telefone="11987654321",
        # IMPORTANTE: Substitua com suas credenciais reais do WhatsApp Business
        whatsapp_token="SEU_TOKEN_WHATSAPP_AQUI",
        phone_number_id="SEU_PHONE_NUMBER_ID_AQUI",
        verify_token="token_secreto_construtora_abc_123",
        # Opcional: Mercado Pago
        mercadopago_access_token=None,
        mercadopago_public_key=None,
        ativa=True
    )

    db.add(empresa)
    db.commit()
    db.refresh(empresa)

    print(f"✅ Empresa criada: {empresa.nome} (ID: {empresa.id})")
    return empresa


def criar_servicos_exemplo(db: Session, empresa_id: int):
    """Cria serviços de exemplo."""
    print("\n📋 Cadastrando serviços...")

    servicos = [
        # Casas
        TipoServico(
            empresa_id=empresa_id,
            categoria="casa",
            descricao="Casa 2/4",
            preco=150.00
        ),
        TipoServico(
            empresa_id=empresa_id,
            categoria="casa",
            descricao="Casa 3/4",
            preco=200.00
        ),
        TipoServico(
            empresa_id=empresa_id,
            categoria="casa",
            descricao="Casa 4/4",
            preco=250.00
        ),
        # Apartamentos
        TipoServico(
            empresa_id=empresa_id,
            categoria="apartamento",
            descricao="Apartamento 2/4",
            preco=120.00
        ),
        TipoServico(
            empresa_id=empresa_id,
            categoria="apartamento",
            descricao="Apartamento 3/4",
            preco=150.00
        ),
        # Fale com atendente
        TipoServico(
            empresa_id=empresa_id,
            categoria="empresa",
            descricao="Fale com atendente",
            preco=0.00
        ),
    ]

    for servico in servicos:
        db.add(servico)

    db.commit()
    print(f"✅ {len(servicos)} serviços cadastrados")


def criar_vagas_agenda_exemplo(db: Session, empresa_id: int):
    """Cria vagas de agenda para os próximos 30 dias."""
    print("\n📅 Cadastrando vagas de agenda...")

    hoje = date.today()
    vagas = []

    for i in range(1, 31):  # Próximos 30 dias
        data_vaga = hoje + timedelta(days=i)

        # Não criar vagas para fins de semana
        if data_vaga.weekday() < 5:  # 0-4 = Segunda a Sexta
            vaga = VagaAgenda(
                empresa_id=empresa_id,
                data=data_vaga,
                quantidade_vagas=5  # 5 vagas por dia
            )
            vagas.append(vaga)
            db.add(vaga)

    db.commit()
    print(f"✅ {len(vagas)} vagas cadastradas (próximos 30 dias úteis)")


def criar_configuracoes_bot_exemplo(db: Session, empresa_id: int):
    """Cria configurações do bot personalizadas."""
    print("\n🤖 Cadastrando configurações do bot...")

    configuracoes = [
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="mensagem_boas_vindas",
            valor="Olá! Bem-vindo à Construtora ABC. Como posso ajudar você hoje?",
            descricao="Mensagem inicial do bot",
            tipo_dado="texto"
        ),
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="menu_principal_titulo",
            valor="🏗️ Menu Principal",
            descricao="Título do menu principal",
            tipo_dado="texto"
        ),
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="categoria_casas_nome",
            valor="Casas",
            descricao="Nome da categoria de casas",
            tipo_dado="texto"
        ),
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="categoria_apartamentos_nome",
            valor="Apartamentos",
            descricao="Nome da categoria de apartamentos",
            tipo_dado="texto"
        ),
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="mensagem_suporte",
            valor="Nossa equipe entrará em contato em até 24 horas.",
            descricao="Mensagem de suporte técnico",
            tipo_dado="texto"
        ),
        ConfiguracaoBot(
            empresa_id=empresa_id,
            chave="telefone_contato",
            valor="(11) 9 8765-4321",
            descricao="Telefone para contato empresarial",
            tipo_dado="texto"
        ),
    ]

    for config in configuracoes:
        db.add(config)

    db.commit()
    print(f"✅ {len(configuracoes)} configurações cadastradas")


def criar_atendente_exemplo(db: Session, empresa_id: int):
    """Cria atendente de exemplo."""
    print("\n👤 Cadastrando atendente...")

    atendente = Atendente(
        empresa_id=empresa_id,
        user_id=1,  # ID de usuário fictício
        nome_exibicao="João Silva",
        email="joao@construtoraabc.com.br",
        status="online",
        pode_atender=True
    )

    db.add(atendente)
    db.commit()
    db.refresh(atendente)

    print(f"✅ Atendente criado: {atendente.nome_exibicao} (ID: {atendente.id})")


def main():
    """Executa setup completo."""
    print("=" * 60)
    print("🚀 SETUP INICIAL - SISTEMA MULTI-TENANT")
    print("=" * 60)

    db = SessionLocal()

    try:
        # 1. Criar empresa
        empresa = criar_empresa_exemplo(db)

        # 2. Criar serviços
        criar_servicos_exemplo(db, empresa.id)

        # 3. Criar vagas de agenda
        criar_vagas_agenda_exemplo(db, empresa.id)

        # 4. Criar configurações do bot
        criar_configuracoes_bot_exemplo(db, empresa.id)

        # 5. Criar atendente
        criar_atendente_exemplo(db, empresa.id)

        print("\n" + "=" * 60)
        print("✅ SETUP CONCLUÍDO COM SUCESSO!")
        print("=" * 60)
        print(f"\n📊 Resumo:")
        print(f"  - Empresa ID: {empresa.id}")
        print(f"  - Nome: {empresa.nome}")
        print(f"  - Phone Number ID: {empresa.phone_number_id}")
        print(f"\n⚠️  IMPORTANTE:")
        print(f"  1. Edite este arquivo e substitua:")
        print(f"     - SEU_TOKEN_WHATSAPP_AQUI")
        print(f"     - SEU_PHONE_NUMBER_ID_AQUI")
        print(f"  2. Configure webhook no Meta Developer:")
        print(f"     URL: https://seu-dominio.ngrok.io/api/v1/webhook")
        print(f"     Verify Token: {empresa.verify_token}")
        print(f"\n📚 Consulte GUIA_MULTI_TENANT.md para mais detalhes")
        print("\n")

    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
    main()
