#!/usr/bin/env python3
"""Script para criar credenciais de autenticação para atendentes"""

from passlib.context import CryptContext
from sqlalchemy import create_engine, text
from datetime import datetime

# Configuração de hash de senha
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Conexão com banco
DATABASE_URL = "postgresql://whatsapp_user:whatsapp_pass_2026@localhost:5434/whatsapp_db"
engine = create_engine(DATABASE_URL)

def criar_atendente_auth(atendente_id: int, email: str, senha: str):
    """Cria credencial de autenticação para um atendente"""
    senha_hash = pwd_context.hash(senha)

    with engine.connect() as conn:
        # Verificar se já existe
        result = conn.execute(
            text("SELECT id FROM atendente_auth WHERE email = :email"),
            {"email": email}
        )

        if result.fetchone():
            print(f"✅ Credencial já existe para {email}")
            return

        # Inserir nova credencial
        conn.execute(
            text("""
                INSERT INTO atendente_auth (atendente_id, email, senha_hash, primeiro_login, criado_em)
                VALUES (:atendente_id, :email, :senha_hash, true, :criado_em)
            """),
            {
                "atendente_id": atendente_id,
                "email": email,
                "senha_hash": senha_hash,
                "criado_em": datetime.now()
            }
        )
        conn.commit()
        print(f"✅ Credencial criada para {email}")

if __name__ == "__main__":
    # Criar credencial para o atendente existente
    criar_atendente_auth(1, "atendente@minhaempresa.com", "atendente123")

    print("\n🎉 Credenciais criadas com sucesso!")
    print("\n📝 Use estas credenciais para login:")
    print("Email: atendente@minhaempresa.com")
    print("Senha: atendente123")
