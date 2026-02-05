"""
Script para setup inicial do banco de dados local
Cria a empresa de teste e o bot de limpeza

Execução:
python setup_local.py
"""

import sys
from sqlalchemy.orm import Session
from app.database.database import SessionLocal, engine
from app.models.models import Base, Empresa
from passlib.context import CryptContext

# Importar função de criar bot
from criar_bot_limpeza import criar_bot_limpeza

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def criar_tabelas():
    """Cria todas as tabelas no banco"""
    print("📦 Criando tabelas no banco de dados...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tabelas criadas!")


def criar_empresa_teste():
    """Cria empresa de teste"""
    db = SessionLocal()

    try:
        # Verificar se já existe
        empresa_existente = db.query(Empresa).filter(
            Empresa.email == "tami.hta1208@gmail.com"
        ).first()

        if empresa_existente:
            print(f"⚠️  Empresa já existe! ID: {empresa_existente.id}")
            return empresa_existente.id

        # Criar nova empresa
        print("🏢 Criando empresa de teste...")

        # Verificar se o modelo usa admin_senha_hash ou senha
        empresa = Empresa(
            nome="YourSystem Limpeza e Engenharia",
            email="tami.hta1208@gmail.com",
            cnpj="12345678000190",
            telefone="75992057013",
            admin_senha_hash=pwd_context.hash("123456"),
            verify_token="meu_token_secreto_123",
            ativa=True,
            whatsapp_token="SEU_WHATSAPP_TOKEN_AQUI",
            phone_number_id="SEU_PHONE_NUMBER_ID_AQUI"
        )

        db.add(empresa)
        db.commit()
        db.refresh(empresa)

        print(f"✅ Empresa criada com sucesso!")
        print(f"   ID: {empresa.id}")
        print(f"   Nome: {empresa.nome}")
        print(f"   Email: {empresa.email}")
        print(f"   Senha: 123456")

        return empresa.id

    except Exception as e:
        print(f"❌ Erro ao criar empresa: {e}")
        db.rollback()
        return None

    finally:
        db.close()


def main():
    """Função principal"""
    print("=" * 80)
    print("🚀 SETUP LOCAL - WhatsApp Sistema")
    print("=" * 80)
    print()

    # 1. Criar tabelas
    criar_tabelas()
    print()

    # 2. Criar empresa
    empresa_id = criar_empresa_teste()

    if not empresa_id:
        print("❌ Não foi possível criar a empresa. Abortando.")
        sys.exit(1)

    print()

    # 3. Criar bot
    print("🤖 Criando bot de limpeza...")
    print()

    sucesso = criar_bot_limpeza(empresa_id)

    print()
    print("=" * 80)

    if sucesso:
        print("✅ SETUP CONCLUÍDO COM SUCESSO!")
        print()
        print("📋 Credenciais de teste:")
        print(f"   Email: tami.hta1208@gmail.com")
        print(f"   Senha: 123456")
        print()
        print("🚀 Próximos passos:")
        print("   1. Iniciar Redis: redis-server")
        print("   2. Iniciar Celery: celery -A app.tasks.celery_app worker --loglevel=info")
        print("   3. Iniciar Backend: uvicorn main:app --reload")
        print("   4. Iniciar Frontend: cd ../frontend_react && npm start")
        print()
        print("🌐 Acesse: http://localhost:3000")
    else:
        print("❌ SETUP FALHOU")
        sys.exit(1)

    print("=" * 80)


if __name__ == "__main__":
    main()
