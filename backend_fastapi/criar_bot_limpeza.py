"""
Script para criar bot de limpeza/engenharia no banco de dados
Baseado no tutorial.txt

Execução:
python criar_bot_limpeza.py
"""

import sys
from sqlalchemy.orm import Session
from app.database.database import SessionLocal, engine
from app.models.models import Base, Empresa, BotFluxoNo, BotFluxoOpcao

# Criar todas as tabelas
Base.metadata.create_all(bind=engine)

def criar_bot_limpeza(empresa_id: int):
    """Cria o fluxo completo do bot de limpeza"""
    db = SessionLocal()

    try:
        # Verificar se empresa existe
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            print(f"❌ Empresa {empresa_id} não encontrada!")
            return False

        print(f"🏢 Criando bot para: {empresa.nome}")

        # ========== 1. NÓ INICIAL - BEM-VINDO ==========
        no_inicial = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='mensagem',
            titulo='Bem-vindo',
            mensagem='👋 Olá! Bem-vindo à *YourSystem Limpeza e Engenharia*!\n\nEscolha uma opção abaixo para continuar:',
            ordem=1
        )
        db.add(no_inicial)
        db.flush()

        # ========== 2. NÓ - CONTRATAÇÃO ==========
        no_contratacao = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='lista',
            titulo='Opções de Contratação',
            mensagem='📋 *Contratação de Serviços*\n\nVocê é cliente novo ou já é nosso cliente?',
            ordem=2
        )
        db.add(no_contratacao)
        db.flush()

        # Opção: Contratação (do nó inicial)
        BotFluxoOpcao(
            no_id=no_inicial.id,
            tipo='botao',
            titulo='💼 Contratação',
            valor='contratacao',
            proximo_no_id=no_contratacao.id,
            ordem=1
        )

        # ========== 3. NÓ - JÁ SOU CLIENTE ==========
        no_ja_cliente = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Já sou cliente - CPF',
            mensagem='📝 Por favor, informe seu *CPF* para buscar seus dados:\n\n_Digite apenas números_',
            campo_esperado='cpf',
            validacao_tipo='cpf',
            ordem=3
        )
        db.add(no_ja_cliente)
        db.flush()

        # ========== 4. NÓ - MENU CLIENTE EXISTENTE ==========
        no_menu_cliente = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='lista',
            titulo='Menu do Cliente',
            mensagem='✅ *Bem-vindo de volta!*\n\nO que você deseja fazer?',
            ordem=4
        )
        db.add(no_menu_cliente)
        db.flush()

        # Conectar já cliente -> menu cliente
        no_ja_cliente.proximo_no_id = no_menu_cliente.id

        # Opções do menu cliente
        BotFluxoOpcao(
            no_id=no_menu_cliente.id,
            tipo='botao',
            titulo='📦 Minhas Contratações',
            valor='minhas_contratacoes',
            ordem=1
        )

        BotFluxoOpcao(
            no_id=no_menu_cliente.id,
            tipo='botao',
            titulo='🛠️ Suporte Técnico',
            valor='suporte_tecnico',
            ordem=2
        )

        BotFluxoOpcao(
            no_id=no_menu_cliente.id,
            tipo='botao',
            titulo='💰 Financeiro',
            valor='financeiro',
            ordem=3
        )

        BotFluxoOpcao(
            no_id=no_menu_cliente.id,
            tipo='botao',
            titulo='📝 Deixar Reclamação',
            valor='reclamacao',
            ordem=4
        )

        # ========== 5. NÓ - NOVO CLIENTE - ESCOLHER TIPO ==========
        no_tipo_servico = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='lista',
            titulo='Tipo de Serviço',
            mensagem='🏠 *Escolha o tipo de imóvel:*',
            ordem=5
        )
        db.add(no_tipo_servico)
        db.flush()

        # Opções de contratação
        BotFluxoOpcao(
            no_id=no_contratacao.id,
            tipo='lista_item',
            titulo='✅ Já sou cliente',
            descricao='Buscar meus dados',
            valor='ja_cliente',
            proximo_no_id=no_ja_cliente.id,
            ordem=1
        )

        BotFluxoOpcao(
            no_id=no_contratacao.id,
            tipo='lista_item',
            titulo='🆕 Novo Cliente',
            descricao='Fazer nova contratação',
            valor='novo_cliente',
            proximo_no_id=no_tipo_servico.id,
            ordem=2
        )

        # ========== 6. NÓ - CASAS - QUARTOS ==========
        no_casas_quartos = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='lista',
            titulo='Casa - Quantos Quartos?',
            mensagem='🏡 *Limpeza de Casa*\n\nQuantos quartos tem a casa?',
            ordem=6
        )
        db.add(no_casas_quartos)
        db.flush()

        # ========== 7. NÓ - APARTAMENTOS - QUARTOS ==========
        no_aptos_quartos = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='lista',
            titulo='Apartamento - Quantos Quartos?',
            mensagem='🏢 *Limpeza de Apartamento*\n\nQuantos quartos tem o apartamento?',
            ordem=7
        )
        db.add(no_aptos_quartos)
        db.flush()

        # ========== 8. NÓ - EMPRESAS - ATENDENTE ==========
        no_empresas = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='transferir_atendente',
            titulo='Empresas - Atendimento',
            mensagem='🏭 *Limpeza Empresarial*\n\n🧑‍💼 Vou transferir você para falar diretamente com um dos nossos atendentes especializados!\n\nAguarde um momento...',
            ordem=8
        )
        db.add(no_empresas)
        db.flush()

        # Opções de tipo de serviço
        BotFluxoOpcao(
            no_id=no_tipo_servico.id,
            tipo='botao',
            titulo='🏡 Casas',
            valor='casas',
            proximo_no_id=no_casas_quartos.id,
            ordem=1
        )

        BotFluxoOpcao(
            no_id=no_tipo_servico.id,
            tipo='botao',
            titulo='🏢 Apartamentos',
            valor='apartamentos',
            proximo_no_id=no_aptos_quartos.id,
            ordem=2
        )

        BotFluxoOpcao(
            no_id=no_tipo_servico.id,
            tipo='botao',
            titulo='🏭 Empresas',
            valor='empresas',
            proximo_no_id=no_empresas.id,
            ordem=3
        )

        # ========== 9. NÓ - AGENDAR DATA ==========
        no_agendar = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Agendar Data',
            mensagem='📅 *Escolha a data para o serviço:*\n\n_Digite a data no formato DD/MM/AAAA_\n\nExemplo: 15/03/2026',
            campo_esperado='data_agendamento',
            validacao_tipo='data',
            ordem=9
        )
        db.add(no_agendar)
        db.flush()

        # Opções de quartos (Casas e Apartamentos - mesmas opções)
        for no_quartos in [no_casas_quartos, no_aptos_quartos]:
            BotFluxoOpcao(
                no_id=no_quartos.id,
                tipo='botao',
                titulo='2 a 4 quartos',
                valor='2_4_quartos',
                proximo_no_id=no_agendar.id,
                ordem=1
            )

            BotFluxoOpcao(
                no_id=no_quartos.id,
                tipo='botao',
                titulo='3 a 4 quartos',
                valor='3_4_quartos',
                proximo_no_id=no_agendar.id,
                ordem=2
            )

            BotFluxoOpcao(
                no_id=no_quartos.id,
                tipo='botao',
                titulo='4 ou mais quartos',
                valor='4_mais_quartos',
                proximo_no_id=no_agendar.id,
                ordem=3
            )

        # ========== 10. NÓ - NOME COMPLETO ==========
        no_nome = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - Nome',
            mensagem='📝 *Vamos fazer seu cadastro!*\n\nPor favor, informe seu *nome completo*:',
            campo_esperado='nome_completo',
            ordem=10
        )
        db.add(no_nome)
        db.flush()

        no_agendar.proximo_no_id = no_nome.id

        # ========== 11. NÓ - CPF ==========
        no_cpf = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - CPF',
            mensagem='🆔 Agora, informe seu *CPF*:\n\n_Digite apenas números_',
            campo_esperado='cpf',
            validacao_tipo='cpf',
            ordem=11
        )
        db.add(no_cpf)
        db.flush()

        no_nome.proximo_no_id = no_cpf.id

        # ========== 12. NÓ - ENDEREÇO ==========
        no_endereco = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - Endereço',
            mensagem='📍 Informe seu *endereço residencial completo*:\n\n_Rua, número_',
            campo_esperado='endereco_residencial',
            ordem=12
        )
        db.add(no_endereco)
        db.flush()

        no_cpf.proximo_no_id = no_endereco.id

        # ========== 13. NÓ - CEP ==========
        no_cep = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - CEP',
            mensagem='📮 Informe o *CEP*:',
            campo_esperado='cep',
            validacao_tipo='cep',
            ordem=13
        )
        db.add(no_cep)
        db.flush()

        no_endereco.proximo_no_id = no_cep.id

        # ========== 14. NÓ - COMPLEMENTO ==========
        no_complemento = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - Complemento',
            mensagem='🏠 *Complemento* (apartamento, bloco, etc):\n\n_Digite "não" se não houver_',
            campo_esperado='complemento',
            ordem=14
        )
        db.add(no_complemento)
        db.flush()

        no_cep.proximo_no_id = no_complemento.id

        # ========== 15. NÓ - CIDADE ==========
        no_cidade = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='input',
            titulo='Cadastro - Cidade',
            mensagem='🏙️ Por último, informe a *cidade*:',
            campo_esperado='cidade',
            ordem=15
        )
        db.add(no_cidade)
        db.flush()

        no_complemento.proximo_no_id = no_cidade.id

        # ========== 16. NÓ - PAGAMENTO ==========
        no_pagamento = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='pagamento',
            titulo='Pagamento',
            mensagem='💰 *Cadastro concluído!*\n\n✅ Dados salvos com sucesso!\n\n💳 Agora vamos para o pagamento.\n\nEscolha a forma de pagamento:',
            ordem=16
        )
        db.add(no_pagamento)
        db.flush()

        no_cidade.proximo_no_id = no_pagamento.id

        # Opções de pagamento
        BotFluxoOpcao(
            no_id=no_pagamento.id,
            tipo='botao',
            titulo='💳 Cartão de Crédito',
            valor='credito',
            ordem=1
        )

        BotFluxoOpcao(
            no_id=no_pagamento.id,
            tipo='botao',
            titulo='💰 PIX',
            valor='pix',
            ordem=2
        )

        BotFluxoOpcao(
            no_id=no_pagamento.id,
            tipo='botao',
            titulo='🏦 Débito',
            valor='debito',
            ordem=3
        )

        # ========== 17. NÓ - FINALIZAÇÃO ==========
        no_final = BotFluxoNo(
            empresa_id=empresa_id,
            tipo='mensagem',
            titulo='Finalização',
            mensagem='✅ *Contratação realizada com sucesso!*\n\n🎉 Obrigado por escolher a YourSystem!\n\n📅 Seu serviço está agendado.\n💬 Em breve você receberá mais informações.\n\nQualquer dúvida, estamos à disposição!',
            ordem=17
        )
        db.add(no_final)
        db.flush()

        # Conectar nó inicial ao primeiro nó
        no_inicial.proximo_no_id = no_contratacao.id

        db.commit()

        print("✅ Bot criado com sucesso!")
        print(f"📊 Total de nós: {db.query(BotFluxoNo).filter(BotFluxoNo.empresa_id == empresa_id).count()}")
        print(f"📋 Total de opções: {db.query(BotFluxoOpcao).join(BotFluxoNo).filter(BotFluxoNo.empresa_id == empresa_id).count()}")

        return True

    except Exception as e:
        print(f"❌ Erro ao criar bot: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False

    finally:
        db.close()


if __name__ == "__main__":
    # ID da empresa (assumindo que é 1, mas pode passar como argumento)
    empresa_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    print("🤖 Criando bot de limpeza/engenharia...")
    print(f"🏢 Empresa ID: {empresa_id}")
    print()

    sucesso = criar_bot_limpeza(empresa_id)

    if sucesso:
        print()
        print("🎉 Bot pronto para usar!")
        print("📱 Teste enviando uma mensagem para o WhatsApp da empresa!")
    else:
        print()
        print("❌ Falha ao criar bot.")
        sys.exit(1)
