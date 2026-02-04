#!/usr/bin/env python3
"""
Script para criar conversas de teste para o sistema WhatsApp
"""

import psycopg2
from datetime import datetime, timedelta
from random import choice, randint

print("=" * 70)
print("🎲 CRIANDO CONVERSAS DE TESTE")
print("=" * 70)

# Conectar ao banco
conn = psycopg2.connect(
    host="localhost",
    port=5434,
    database="whatsapp_db",
    user="whatsapp_user",
    password="whatsapp_pass_2026"
)
cursor = conn.cursor()

# Dados de teste
nomes_clientes = [
    "João Silva", "Maria Santos", "Pedro Oliveira", "Ana Costa", "Carlos Ferreira",
    "Juliana Lima", "Roberto Alves", "Fernanda Souza", "Lucas Pereira", "Camila Rocha",
    "Rafael Martins", "Patricia Dias", "Bruno Cardoso", "Amanda Ribeiro", "Diego Castro",
    "Larissa Monteiro", "Marcelo Barbosa", "Tatiana Gomes", "Felipe Araujo", "Gabriela Mendes"
]

mensagens_bot = [
    "Olá! Como posso ajudar?",
    "Gostaria de agendar um horário?",
    "Preciso de mais informações sobre seu problema",
    "Pode me informar seu nome completo?",
    "Em que dia você prefere o atendimento?",
    "Obrigado por entrar em contato!",
    "Estou processando sua solicitação...",
    "Você pode me passar mais detalhes?",
    "Entendi! Vou verificar isso para você",
    "Aguarde um momento, por favor"
]

mensagens_cliente = [
    "Oi, preciso de ajuda",
    "Quero agendar para amanhã",
    "Pode ser às 14h?",
    "Meu nome é João",
    "Preciso falar com um atendente",
    "Urgente, por favor!",
    "Obrigado pela atenção",
    "Tudo bem, aguardo",
    "Ok, entendi",
    "Quando vocês abrem?"
]

try:
    # Buscar empresa e atendentes
    cursor.execute("SELECT id FROM empresa LIMIT 1")
    empresa_id = cursor.fetchone()[0]

    cursor.execute("SELECT id FROM painel_atendente WHERE empresa_id = %s", (empresa_id,))
    atendentes = [row[0] for row in cursor.fetchall()]

    print(f"\n📌 Empresa ID: {empresa_id}")
    print(f"📌 Atendentes disponíveis: {len(atendentes)}")

    if len(atendentes) == 0:
        print("\n⚠️  Nenhum atendente encontrado! Criando atendentes de teste...")
        # Criar 3 atendentes de teste se não existirem
        for i in range(1, 4):
            cursor.execute("""
                INSERT INTO painel_atendente
                (empresa_id, user_id, nome_exibicao, email, status, pode_atender)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (empresa_id, i, f"Atendente {i}", f"atendente{i}@test.com", 'offline', True))
            atendente_id = cursor.fetchone()[0]
            atendentes.append(atendente_id)
            print(f"  ✅ Atendente {i} criado (ID: {atendente_id})")
        conn.commit()

    # Criar clientes
    print("\n👥 Criando clientes...")
    clientes_criados = []

    for i, nome in enumerate(nomes_clientes, start=1):
        whatsapp = f"5511{randint(900000000, 999999999)}"
        cpf = f"{randint(10000000000, 99999999999)}"

        # Verificar se já existe
        cursor.execute("SELECT id, whatsapp_number, nome_completo FROM whatsapp_bot_cliente WHERE whatsapp_number = %s", (whatsapp,))
        existing = cursor.fetchone()

        if existing:
            clientes_criados.append({
                'id': existing[0],
                'whatsapp': existing[1],
                'nome': existing[2]
            })
        else:
            cursor.execute("""
                INSERT INTO whatsapp_bot_cliente (empresa_id, whatsapp_number, nome_completo, cpf)
                VALUES (%s, %s, %s, %s)
                RETURNING id, whatsapp_number, nome_completo
            """, (empresa_id, whatsapp, nome, cpf))

            result = cursor.fetchone()
            clientes_criados.append({
                'id': result[0],
                'whatsapp': result[1],
                'nome': result[2]
            })
            print(f"  ✅ {nome} - {whatsapp}")

    conn.commit()
    print(f"\n✅ {len(clientes_criados)} clientes criados!")

    # Criar conversas com status variados
    print("\n💬 Criando conversas...")

    conversas_bot = 0
    conversas_aguardando = 0
    conversas_atendimento = 0

    for cliente in clientes_criados:
        status_choice = randint(1, 10)

        if status_choice <= 3:
            # 30% bot
            status = 'bot'
            atendente_id = None
            tempo_atras = timedelta(minutes=randint(1, 60))
            conversas_bot += 1
        elif status_choice <= 6:
            # 30% aguardando
            status = 'aguardando'
            atendente_id = None
            tempo_atras = timedelta(minutes=randint(5, 120))
            conversas_aguardando += 1
        else:
            # 40% em_atendimento
            status = 'em_atendimento'
            atendente_id = choice(atendentes)
            tempo_atras = timedelta(minutes=randint(1, 30))
            conversas_atendimento += 1

        iniciado_em = datetime.now() - tempo_atras
        atribuido_em = iniciado_em + timedelta(seconds=30) if atendente_id else None

        # Deletar conversa existente se houver
        cursor.execute("DELETE FROM painel_atendimento WHERE whatsapp_number = %s", (cliente['whatsapp'],))

        cursor.execute("""
            INSERT INTO painel_atendimento
            (whatsapp_number, atendente_id, status, iniciado_em, atribuido_em, ultima_mensagem_em)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            cliente['whatsapp'],
            atendente_id,
            status,
            iniciado_em,
            atribuido_em,
            datetime.now()
        ))

        # Criar mensagens para cada conversa
        num_mensagens = randint(2, 8)
        timestamp_msg = iniciado_em

        for j in range(num_mensagens):
            if j % 2 == 0:
                # Mensagem recebida (do cliente)
                direcao = 'recebida'
                conteudo = choice(mensagens_cliente)
                lida = status != 'bot'  # Não lidas se ainda está com bot
            else:
                # Mensagem enviada (resposta)
                direcao = 'enviada'
                conteudo = choice(mensagens_bot)
                lida = True

            timestamp_msg += timedelta(seconds=randint(30, 180))

            cursor.execute("""
                INSERT INTO whatsapp_bot_mensagemlog
                (empresa_id, whatsapp_number, message_id, direcao, tipo_mensagem, conteudo, timestamp, lida)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                empresa_id,
                cliente['whatsapp'],
                f"msg_{cliente['whatsapp']}_{j}_{randint(1000, 9999)}",
                direcao,
                'text',
                conteudo,
                timestamp_msg,
                lida
            ))

        emoji = "🟢" if status == "em_atendimento" else "🟡" if status == "aguardando" else "🤖"
        atendente_info = f" → Atendente {atendente_id}" if atendente_id else ""
        print(f"  {emoji} {cliente['nome'][:20]:20} | {status:15} {atendente_info}")

    conn.commit()

    print("\n" + "=" * 70)
    print("📊 RESUMO")
    print("=" * 70)
    print(f"👥 Clientes criados:     {len(clientes_criados)}")
    print(f"🤖 Conversas BOT:        {conversas_bot}")
    print(f"🟡 Conversas AGUARDANDO: {conversas_aguardando}")
    print(f"🟢 Conversas ATENDIMENTO: {conversas_atendimento}")
    print(f"💬 Total conversas:      {len(clientes_criados)}")
    print("=" * 70)

    print("\n✅ DADOS DE TESTE CRIADOS COM SUCESSO!")
    print("\n🎯 Agora você pode:")
    print("  1. Fazer login como atendente")
    print("  2. Ver fila com conversas bot/aguardando")
    print("  3. Assumir conversas")
    print("  4. Ver seus chats ativos")
    print("  5. Transferir conversas")
    print("=" * 70)

except Exception as e:
    print(f"\n❌ Erro: {e}")
    import traceback
    traceback.print_exc()
    conn.rollback()
finally:
    cursor.close()
    conn.close()
