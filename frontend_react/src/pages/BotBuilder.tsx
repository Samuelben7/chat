import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import api from '../services/api';
import whatsappBg from '../images/PLANO-DE-FUNDO-WHATS-APP.png';

// Base URL do servidor (sem /api/v1) para acessar arquivos estáticos como /uploads/...
const SERVER_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api/v1', '') || 'http://localhost:8000';

/** Converte path local (/uploads/...) em URL completa para preview */
const resolveImageUrl = (url: string) => {
  if (url && url.startsWith('/uploads/')) {
    return `${SERVER_BASE_URL}${url}`;
  }
  return url;
};

interface BotFluxo {
  id: number;
  nome: string;
  descricao: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

interface BotFluxoOpcao {
  id?: number;
  tipo: string;
  titulo: string;
  descricao?: string;
  valor?: string;
  proximo_no_id?: number;
  ordem: number;
}

interface BotFluxoNo {
  id?: number;
  identificador: string;
  tipo: string;
  titulo?: string;
  conteudo?: string;
  dados_extras?: any;
  proximo_no_id?: number;
  ordem: number;
  opcoes: BotFluxoOpcao[];
}

interface BotFluxoDetalhado extends BotFluxo {
  nos: BotFluxoNo[];
}

// Dados coletaveis fixos - espelha DADOS_COLETAVEIS do backend
const DADOS_COLETAVEIS: Record<string, { label: string; validacao: string; placeholder: string; grupo: string }> = {
  nome_completo:       { label: 'Nome Completo',         validacao: 'nao_vazio', placeholder: 'Por favor, informe seu nome completo:',           grupo: 'Pessoal' },
  cpf:                 { label: 'CPF',                   validacao: 'cpf',       placeholder: 'Informe seu CPF (apenas numeros):',               grupo: 'Pessoal' },
  rg:                  { label: 'RG',                    validacao: 'nao_vazio', placeholder: 'Informe seu RG:',                                 grupo: 'Pessoal' },
  email:               { label: 'E-mail',                validacao: 'email',     placeholder: 'Informe seu e-mail:',                             grupo: 'Pessoal' },
  data_nascimento:     { label: 'Data de Nascimento',    validacao: 'data',      placeholder: 'Informe sua data de nascimento (DD/MM/AAAA):',    grupo: 'Pessoal' },
  telefone_secundario: { label: 'Telefone Secundario',   validacao: 'telefone',  placeholder: 'Informe um telefone de contato com DDD:',         grupo: 'Pessoal' },
  endereco:            { label: 'Endereco (Rua/Numero)', validacao: 'nao_vazio', placeholder: 'Informe seu endereco (rua e numero):',            grupo: 'Endereco' },
  complemento:         { label: 'Complemento',           validacao: 'texto',     placeholder: 'Informe o complemento (apto, bloco, etc):',       grupo: 'Endereco' },
  bairro:              { label: 'Bairro',                validacao: 'nao_vazio', placeholder: 'Informe seu bairro:',                             grupo: 'Endereco' },
  cidade:              { label: 'Cidade',                validacao: 'nao_vazio', placeholder: 'Informe sua cidade:',                             grupo: 'Endereco' },
  estado:              { label: 'Estado (UF)',           validacao: 'nao_vazio', placeholder: 'Informe seu estado (ex: SP, RJ, MG):',            grupo: 'Endereco' },
  pais:                { label: 'Pais',                  validacao: 'nao_vazio', placeholder: 'Informe seu pais:',                               grupo: 'Endereco' },
  cep:                 { label: 'CEP',                   validacao: 'cep',       placeholder: 'Informe seu CEP (8 digitos):',                    grupo: 'Endereco' },
  chave_pix:           { label: 'Chave PIX',             validacao: 'nao_vazio', placeholder: 'Informe sua chave PIX (CPF, email, telefone ou aleatoria):', grupo: 'Financeiro' },
  profissao:           { label: 'Profissao',             validacao: 'texto',     placeholder: 'Qual sua profissao?',                             grupo: 'Profissional' },
  empresa_cliente:     { label: 'Nome da Empresa',       validacao: 'texto',     placeholder: 'Informe o nome da sua empresa:',                  grupo: 'Profissional' },
};

// Node type config for colors and icons
const NODE_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  mensagem: { icon: '💬', color: '#3B82F6', label: 'Mensagem' },
  lista: { icon: '📋', color: '#8B5CF6', label: 'Lista' },
  botoes: { icon: '🔘', color: '#10B981', label: 'Botoes' },
  transferir_atendente: { icon: '👤', color: '#F59E0B', label: 'Transferir' },
  coletar_dado: { icon: '📝', color: '#EC4899', label: 'Coletar Dado' },
  condicional: { icon: '🔀', color: '#6366F1', label: 'Condicional' },
  delay: { icon: '⏱️', color: '#14B8A6', label: 'Delay' },
  webhook_externo: { icon: '🌐', color: '#F97316', label: 'Webhook' },
  gerar_pagamento: { icon: '💰', color: '#16A34A', label: 'PIX/Pagamento' },
};

// ==================== INTERACTIVE CHAT PREVIEW ====================

interface ChatMessage {
  type: 'bot' | 'user' | 'system';
  content: string;
  node?: BotFluxoNo;
  buttons?: BotFluxoOpcao[];
  listItems?: BotFluxoOpcao[];
}

const BotChatPreview: React.FC<{ nos: BotFluxoNo[] }> = ({ nos }) => {
  const { colors, theme } = useTheme();
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [showListModal, setShowListModal] = useState(false);
  const [currentListItems, setCurrentListItems] = useState<BotFluxoOpcao[]>([]);
  const [waitingInput, setWaitingInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const nodesById: Record<number, BotFluxoNo> = {};
  const nodesByIdent: Record<string, BotFluxoNo> = {};
  nos.forEach(n => {
    if (n.id) nodesById[n.id] = n;
    nodesByIdent[n.identificador] = n;
  });

  const botBubbleBg = theme === 'whatsapp' ? '#FFFFFF' : '#1a1f3a';
  const botBubbleText = theme === 'whatsapp' ? '#111B21' : '#ffffff';
  const userBubbleBg = theme === 'whatsapp' ? '#D9FDD3' : '#1e3a5f';
  const timeSColor = theme === 'whatsapp' ? '#667781' : '#8899aa';

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const simulateNode = (node: BotFluxoNo, history: ChatMessage[]): ChatMessage[] => {
    const newHistory = [...history];
    const config = NODE_TYPE_CONFIG[node.tipo] || NODE_TYPE_CONFIG.mensagem;

    if (node.tipo === 'mensagem') {
      newHistory.push({ type: 'bot', content: node.conteudo || '', node });
      // Auto advance to next node
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'botoes') {
      const sortedOpts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem).slice(0, 3);
      newHistory.push({ type: 'bot', content: node.conteudo || 'Escolha uma opcao:', node, buttons: sortedOpts });
    } else if (node.tipo === 'lista') {
      const sortedOpts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem).slice(0, 10);
      newHistory.push({ type: 'bot', content: node.conteudo || 'Selecione uma opcao:', node, listItems: sortedOpts });
    } else if (node.tipo === 'coletar_dado') {
      const dadoKey = node.dados_extras?.variavel || '';
      const dadoConfig = DADOS_COLETAVEIS[dadoKey];
      const defaultMsg = dadoConfig ? dadoConfig.placeholder : `Informe seu ${dadoKey || 'dado'}:`;
      newHistory.push({ type: 'bot', content: node.conteudo || defaultMsg, node });
    } else if (node.tipo === 'transferir_atendente') {
      newHistory.push({ type: 'bot', content: node.conteudo || 'Transferindo para atendente...', node });
      newHistory.push({ type: 'system', content: `${config.icon} Transferido para atendimento humano` });
    } else if (node.tipo === 'delay') {
      const dur = node.dados_extras?.duracao || 1;
      const unit = node.dados_extras?.unidade || 'segundos';
      newHistory.push({ type: 'system', content: `${config.icon} Aguardando ${dur} ${unit}...` });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'webhook_externo') {
      newHistory.push({ type: 'system', content: `${config.icon} Chamando webhook: ${node.dados_extras?.method || 'POST'} ...` });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'condicional') {
      newHistory.push({ type: 'system', content: `${config.icon} Condicao: ${node.dados_extras?.condicao || node.conteudo || '...'}` });
      // Go true path by default in preview
      const opts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem);
      if (opts.length > 0 && opts[0].proximo_no_id && nodesById[opts[0].proximo_no_id]) {
        newHistory.push({ type: 'system', content: `-> ${opts[0].titulo || 'Verdadeiro'}` });
        return simulateNode(nodesById[opts[0].proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'gerar_pagamento') {
      const valor = node.dados_extras?.valor || '0.00';
      const desc = node.dados_extras?.descricao || 'Pagamento';
      newHistory.push({
        type: 'bot',
        content: `💰 Pagamento PIX gerado!\n\nValor: R$ ${parseFloat(valor).toFixed(2)}\nDescricao: ${desc}\n\nCodigo PIX:\n00020126360014BR.GOV.BCB.PIX... (simulado)`,
        node
      });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    }

    return newHistory;
  };

  const startSimulation = () => {
    // Find start node
    const startNode = nodesByIdent['inicio'] || (nos.length > 0 ? [...nos].sort((a, b) => a.ordem - b.ordem)[0] : null);
    if (!startNode) {
      setChatHistory([]);
      return;
    }
    const history = simulateNode(startNode, []);
    setChatHistory(history);
    setWaitingInput(false);
    scrollToBottom();
  };

  // Reset simulation when nodes change
  useEffect(() => {
    startSimulation();
  }, [nos]);

  const handleOptionClick = (opcao: BotFluxoOpcao) => {
    const newHistory = [...chatHistory, { type: 'user' as const, content: opcao.titulo }];
    if (opcao.proximo_no_id && nodesById[opcao.proximo_no_id]) {
      const result = simulateNode(nodesById[opcao.proximo_no_id], newHistory);
      setChatHistory(result);
    } else {
      setChatHistory([...newHistory, { type: 'system' as const, content: '(Sem proximo no configurado)' }]);
    }
    setShowListModal(false);
    scrollToBottom();
  };

  const handleUserInput = () => {
    if (!inputText.trim()) return;
    const lastBotMsg = [...chatHistory].reverse().find(m => m.type === 'bot' && m.node);
    const newHistory = [...chatHistory, { type: 'user' as const, content: inputText }];
    setInputText('');
    setWaitingInput(false);

    if (lastBotMsg?.node?.proximo_no_id && nodesById[lastBotMsg.node.proximo_no_id]) {
      const result = simulateNode(nodesById[lastBotMsg.node.proximo_no_id], newHistory);
      setChatHistory(result);
    } else {
      setChatHistory([...newHistory, { type: 'system' as const, content: '(Fim do fluxo)' }]);
    }
    scrollToBottom();
  };

  // Check if last message needs input
  const lastMsg = chatHistory[chatHistory.length - 1];
  const needsInput = lastMsg?.type === 'bot' && lastMsg.node?.tipo === 'coletar_dado';
  const hasButtons = lastMsg?.type === 'bot' && lastMsg.buttons && lastMsg.buttons.length > 0;
  const hasList = lastMsg?.type === 'bot' && lastMsg.listItems && lastMsg.listItems.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400, maxHeight: 650, position: 'relative' }}>
      {/* Chat area */}
      <div style={{
        background: theme === 'whatsapp' ? '#E5DDD5' : '#0d1229',
        ...(theme === 'whatsapp' && {
          backgroundImage: `url(${whatsappBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }),
        borderRadius: 12,
        padding: 16,
        flex: 1,
        overflowY: 'auto',
        position: 'relative',
      }}>
        {chatHistory.length === 0 ? (
          <div style={{ textAlign: 'center', color: colors.textSecondary, paddingTop: 80 }}>
            <p style={{ fontSize: 40, marginBottom: 8 }}>💬</p>
            <p>Adicione etapas para ver a preview</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatHistory.map((msg, i) => {
              if (msg.type === 'system') {
                return (
                  <div key={i} style={{ textAlign: 'center', padding: '4px 12px' }}>
                    <span style={{
                      background: theme === 'whatsapp' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
                      color: colors.textSecondary,
                      fontSize: 11,
                      padding: '3px 10px',
                      borderRadius: 6,
                    }}>
                      {msg.content}
                    </span>
                  </div>
                );
              }

              if (msg.type === 'user') {
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      background: userBubbleBg,
                      borderRadius: '12px 12px 0 12px',
                      padding: '8px 12px',
                      maxWidth: '75%',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    }}>
                      <p style={{ color: botBubbleText, fontSize: 13, margin: 0 }}>{msg.content}</p>
                      <div style={{ textAlign: 'right', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: timeSColor }}>12:01</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Bot message
              const hasInteractive = (msg.buttons && msg.buttons.length > 0) || (msg.listItems && msg.listItems.length > 0);
              const headerImg = msg.node?.dados_extras?.header_image_url;

              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%',
                    background: botBubbleBg,
                    borderRadius: '12px 12px 12px 0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                  }}>
                    {/* Header image */}
                    {headerImg && (
                      <div style={{
                        width: '100%',
                        height: 140,
                        background: `url(${resolveImageUrl(headerImg)}) center/cover no-repeat`,
                        backgroundColor: theme === 'whatsapp' ? '#e0e0e0' : '#1e2340',
                      }} />
                    )}

                    <div style={{ padding: '8px 12px' }}>
                      {msg.node?.titulo && (
                        <p style={{ fontWeight: 600, color: botBubbleText, fontSize: 13, margin: '0 0 4px' }}>
                          {msg.node.titulo}
                        </p>
                      )}
                      <p style={{ color: botBubbleText, fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </p>
                      <div style={{ textAlign: 'right', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: timeSColor }}>12:00</span>
                      </div>
                    </div>

                    {/* Interactive buttons */}
                    {msg.buttons && msg.buttons.length > 0 && i === chatHistory.length - 1 &&
                      msg.buttons.map((opt, oi) => (
                        <div
                          key={opt.id || oi}
                          onClick={() => handleOptionClick(opt)}
                          style={{
                            borderTop: `1px solid ${theme === 'whatsapp' ? '#e5e7eb' : '#2a3050'}`,
                            padding: '10px 12px',
                            textAlign: 'center',
                            color: '#0088cc',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = theme === 'whatsapp' ? '#f0f0f0' : '#252a4a')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {opt.titulo}
                        </div>
                      ))
                    }

                    {/* Non-interactive buttons (history) */}
                    {msg.buttons && msg.buttons.length > 0 && i !== chatHistory.length - 1 &&
                      msg.buttons.map((opt, oi) => (
                        <div
                          key={opt.id || oi}
                          style={{
                            borderTop: `1px solid ${theme === 'whatsapp' ? '#e5e7eb' : '#2a3050'}`,
                            padding: '8px 12px',
                            textAlign: 'center',
                            color: `${colors.primary}66`,
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          {opt.titulo}
                        </div>
                      ))
                    }

                    {/* List button */}
                    {msg.listItems && msg.listItems.length > 0 && i === chatHistory.length - 1 && (
                      <div
                        onClick={() => { setCurrentListItems(msg.listItems!); setShowListModal(true); }}
                        style={{
                          borderTop: `1px solid ${theme === 'whatsapp' ? '#e5e7eb' : '#2a3050'}`,
                          padding: '10px 12px',
                          textAlign: 'center',
                          color: '#0088cc',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Ver opcoes ({msg.listItems.length})
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area for coletar_dado */}
      {needsInput && (
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '8px 0',
          marginTop: 4,
        }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUserInput()}
            placeholder={`Digite ${DADOS_COLETAVEIS[lastMsg?.node?.dados_extras?.variavel]?.label || 'resposta'}...`}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 20,
              border: `1px solid ${colors.inputBorder}`,
              background: colors.inputBg,
              color: colors.textPrimary,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleUserInput}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              background: colors.gradientButton,
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Enviar
          </button>
        </div>
      )}

      {/* Reset button */}
      {chatHistory.length > 0 && (
        <button
          onClick={startSimulation}
          style={{
            marginTop: 6,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: 'none',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Reiniciar simulacao
        </button>
      )}

      {/* List selection modal - contained inside preview */}
      {showListModal && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 10,
          borderRadius: 12,
        }}
          onClick={() => setShowListModal(false)}
        >
          <div
            style={{
              background: colors.cardBg,
              borderRadius: '12px 12px 0 0',
              padding: 12,
              width: '100%',
              maxHeight: '60%',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: colors.border, margin: '0 auto 6px' }} />
              <p style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14, margin: 0 }}>Opcoes</p>
            </div>
            {currentListItems.map((item, i) => (
              <div
                key={item.id || i}
                onClick={() => handleOptionClick(item)}
                style={{
                  padding: '10px 12px',
                  borderBottom: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <p style={{ color: colors.textPrimary, fontWeight: 500, fontSize: 13, margin: 0 }}>{item.titulo}</p>
                {item.descricao && (
                  <p style={{ color: colors.textSecondary, fontSize: 11, margin: '2px 0 0' }}>{item.descricao}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================

const BotBuilder: React.FC = () => {
  const { colors, theme } = useTheme();
  const [fluxos, setFluxos] = useState<BotFluxo[]>([]);
  const [fluxoSelecionado, setFluxoSelecionado] = useState<BotFluxoDetalhado | null>(null);
  const [modalNovoFluxo, setModalNovoFluxo] = useState(false);
  const [modalNovoNo, setModalNovoNo] = useState(false);
  const [modalEditarNo, setModalEditarNo] = useState(false);
  const [noEditando, setNoEditando] = useState<BotFluxoNo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNodeId, setExpandedNodeId] = useState<number | null>(null);

  // Form states
  const [nomeFluxo, setNomeFluxo] = useState('');
  const [descricaoFluxo, setDescricaoFluxo] = useState('');

  // Novo no form
  const [novoNo, setNovoNo] = useState<BotFluxoNo>({
    identificador: '',
    tipo: 'mensagem',
    titulo: '',
    conteudo: '',
    dados_extras: {},
    ordem: 0,
    opcoes: []
  });

  useEffect(() => {
    carregarFluxos();
  }, []);

  const carregarFluxos = async () => {
    try {
      const response = await api.get('/bot-builder/fluxos');
      setFluxos(response.data);
    } catch (error) {
      console.error('Erro ao carregar fluxos:', error);
    }
  };

  const carregarFluxoDetalhado = async (fluxoId: number) => {
    try {
      setLoading(true);
      const response = await api.get(`/bot-builder/fluxos/${fluxoId}`);
      setFluxoSelecionado(response.data);
    } catch (error) {
      console.error('Erro ao carregar fluxo:', error);
    } finally {
      setLoading(false);
    }
  };

  const criarFluxo = async () => {
    try {
      await api.post('/bot-builder/fluxos', {
        nome: nomeFluxo,
        descricao: descricaoFluxo,
        ativo: false
      });

      setNomeFluxo('');
      setDescricaoFluxo('');
      setModalNovoFluxo(false);
      carregarFluxos();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao criar fluxo');
    }
  };

  const ativarFluxo = async (fluxoId: number, ativo: boolean) => {
    try {
      await api.post(`/bot-builder/fluxos/${fluxoId}/ativar`, { ativo });
      carregarFluxos();
      if (fluxoSelecionado) {
        carregarFluxoDetalhado(fluxoSelecionado.id);
      }
    } catch (error) {
      console.error('Erro ao ativar/desativar fluxo:', error);
    }
  };

  const deletarFluxo = async (fluxoId: number) => {
    if (!window.confirm('Tem certeza que deseja deletar este fluxo?')) return;

    try {
      await api.delete(`/bot-builder/fluxos/${fluxoId}`);
      carregarFluxos();
      if (fluxoSelecionado?.id === fluxoId) {
        setFluxoSelecionado(null);
      }
    } catch (error) {
      console.error('Erro ao deletar fluxo:', error);
    }
  };

  const criarNo = async () => {
    if (!fluxoSelecionado) return;

    try {
      const payload = { ...novoNo };
      // Store extra data in dados_extras for new node types
      if (['coletar_dado', 'condicional', 'delay', 'webhook_externo', 'gerar_pagamento'].includes(novoNo.tipo)) {
        payload.dados_extras = novoNo.dados_extras || {};
      }

      await api.post(`/bot-builder/fluxos/${fluxoSelecionado.id}/nos`, payload);

      setNovoNo({
        identificador: '',
        tipo: 'mensagem',
        titulo: '',
        conteudo: '',
        dados_extras: {},
        ordem: 0,
        opcoes: []
      });

      setModalNovoNo(false);
      carregarFluxoDetalhado(fluxoSelecionado.id);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao criar nó');
    }
  };

  const deletarNo = async (noId: number) => {
    if (!window.confirm('Tem certeza que deseja deletar este nó?')) return;

    try {
      await api.delete(`/bot-builder/nos/${noId}`);
      if (fluxoSelecionado) {
        carregarFluxoDetalhado(fluxoSelecionado.id);
      }
    } catch (error) {
      console.error('Erro ao deletar nó:', error);
    }
  };

  const abrirEdicaoNo = (no: BotFluxoNo) => {
    setNoEditando({ ...no, opcoes: no.opcoes.map(o => ({ ...o })) });
    setModalEditarNo(true);
  };

  const salvarEdicaoNo = async () => {
    if (!noEditando?.id || !fluxoSelecionado) return;

    try {
      // Atualizar o no principal
      await api.patch(`/bot-builder/nos/${noEditando.id}`, {
        identificador: noEditando.identificador,
        tipo: noEditando.tipo,
        titulo: noEditando.titulo,
        conteudo: noEditando.conteudo,
        dados_extras: noEditando.dados_extras || {},
        proximo_no_id: noEditando.proximo_no_id || null,
        ordem: noEditando.ordem,
      });

      // Buscar opcoes atuais do servidor para comparar
      const noOriginal = fluxoSelecionado.nos.find(n => n.id === noEditando.id);
      const opcOrigIds = new Set((noOriginal?.opcoes || []).map(o => o.id).filter(Boolean));
      const opcEditIds = new Set(noEditando.opcoes.map(o => o.id).filter(Boolean));

      // Deletar opcoes removidas
      for (const origOpc of (noOriginal?.opcoes || [])) {
        if (origOpc.id && !opcEditIds.has(origOpc.id)) {
          await api.delete(`/bot-builder/opcoes/${origOpc.id}`);
        }
      }

      // Atualizar existentes e criar novas
      for (const opc of noEditando.opcoes) {
        if (opc.id && opcOrigIds.has(opc.id)) {
          // Atualizar existente
          await api.patch(`/bot-builder/opcoes/${opc.id}`, {
            titulo: opc.titulo,
            descricao: opc.descricao,
            valor: opc.valor,
            proximo_no_id: opc.proximo_no_id || null,
            ordem: opc.ordem,
          });
        } else {
          // Criar nova
          await api.post(`/bot-builder/nos/${noEditando.id}/opcoes`, {
            tipo: noEditando.tipo === 'lista' ? 'lista_item' : 'botao',
            titulo: opc.titulo,
            descricao: opc.descricao,
            valor: opc.valor,
            proximo_no_id: opc.proximo_no_id || null,
            ordem: opc.ordem,
          });
        }
      }

      setModalEditarNo(false);
      setNoEditando(null);
      carregarFluxoDetalhado(fluxoSelecionado.id);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao salvar edição');
    }
  };

  const updateEditDadosExtras = (key: string, value: any) => {
    if (!noEditando) return;
    setNoEditando({
      ...noEditando,
      dados_extras: { ...noEditando.dados_extras, [key]: value }
    });
  };

  const adicionarOpcaoEdit = () => {
    if (!noEditando) return;
    setNoEditando({
      ...noEditando,
      opcoes: [
        ...noEditando.opcoes,
        {
          tipo: noEditando.tipo === 'lista' ? 'lista_item' : 'botao',
          titulo: '',
          descricao: '',
          ordem: noEditando.opcoes.length
        }
      ]
    });
  };

  const removerOpcaoEdit = (index: number) => {
    if (!noEditando) return;
    setNoEditando({
      ...noEditando,
      opcoes: noEditando.opcoes.filter((_, i) => i !== index)
    });
  };

  const atualizarOpcaoEdit = (index: number, campo: string, valor: string) => {
    if (!noEditando) return;
    const novasOpcoes = [...noEditando.opcoes];
    if (campo === 'proximo_no_id') {
      novasOpcoes[index] = { ...novasOpcoes[index], proximo_no_id: valor ? Number(valor) : undefined };
    } else {
      novasOpcoes[index] = { ...novasOpcoes[index], [campo]: valor };
    }
    setNoEditando({ ...noEditando, opcoes: novasOpcoes });
  };

  const adicionarOpcao = () => {
    setNovoNo({
      ...novoNo,
      opcoes: [
        ...novoNo.opcoes,
        {
          tipo: novoNo.tipo === 'lista' ? 'lista_item' : 'botao',
          titulo: '',
          descricao: '',
          ordem: novoNo.opcoes.length
        }
      ]
    });
  };

  const removerOpcao = (index: number) => {
    const novasOpcoes = novoNo.opcoes.filter((_, i) => i !== index);
    setNovoNo({ ...novoNo, opcoes: novasOpcoes });
  };

  const atualizarOpcao = (index: number, campo: string, valor: string) => {
    const novasOpcoes = [...novoNo.opcoes];
    if (campo === 'proximo_no_id') {
      novasOpcoes[index] = { ...novasOpcoes[index], proximo_no_id: valor ? Number(valor) : undefined };
    } else {
      novasOpcoes[index] = { ...novasOpcoes[index], [campo]: valor };
    }
    setNovoNo({ ...novoNo, opcoes: novasOpcoes });
  };

  const updateDadosExtras = (key: string, value: any) => {
    setNovoNo({
      ...novoNo,
      dados_extras: { ...novoNo.dados_extras, [key]: value }
    });
  };

  const inputStyle = {
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.textPrimary
  };

  return (
    <div className="min-h-screen p-6" style={{ background: colors.dashboardBg }}>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{
              backgroundImage: colors.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
              display: 'inline-block',
            }}>
              🤖 Bot Builder
            </h1>
            <p style={{ color: colors.textSecondary }}>
              Crie e configure o fluxo do seu bot de atendimento
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = '/empresa/dashboard'}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: colors.hoverBg, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
            >
              ← Dashboard
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* 3-Column Grid: Fluxos | Editor | Chat Preview */}
        <div className="grid grid-cols-12 gap-6">

          {/* LEFT: Lista de Fluxos (col-span-3) */}
          <div className="col-span-3">
            <div className="rounded-2xl p-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                  Meus Fluxos
                </h2>
                <button
                  onClick={() => setModalNovoFluxo(true)}
                  className="px-3 py-1.5 rounded-full font-semibold transition-all text-white text-sm"
                  style={{ background: colors.gradientButton }}
                >
                  + Novo
                </button>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {fluxos.map((fluxo) => (
                  <div
                    key={fluxo.id}
                    className="p-3 rounded-lg cursor-pointer transition-all"
                    style={{
                      background: fluxoSelecionado?.id === fluxo.id ? `${colors.primary}15` : colors.hoverBg,
                      border: `1px solid ${fluxoSelecionado?.id === fluxo.id ? colors.primary : 'transparent'}`
                    }}
                    onClick={() => carregarFluxoDetalhado(fluxo.id)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
                        {fluxo.nome}
                      </h3>
                      {fluxo.ativo && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: '#22c55e'
                        }}>
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
                      {fluxo.descricao || 'Sem descrição'}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ativarFluxo(fluxo.id, !fluxo.ativo);
                        }}
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: fluxo.ativo ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: fluxo.ativo ? '#ef4444' : '#22c55e'
                        }}
                      >
                        {fluxo.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletarFluxo(fluxo.id);
                        }}
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#ef4444'
                        }}
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                ))}

                {fluxos.length === 0 && (
                  <div className="text-center py-8" style={{ color: colors.textSecondary }}>
                    Nenhum fluxo criado ainda
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CENTER: Editor de Fluxo (col-span-5) */}
          <div className="col-span-5">
            {loading ? (
              <div className="text-center py-12" style={{ color: colors.textSecondary }}>
                Carregando...
              </div>
            ) : fluxoSelecionado ? (
              <div className="rounded-2xl p-5" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
                      {fluxoSelecionado.nome}
                    </h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      {fluxoSelecionado.descricao}
                    </p>
                  </div>
                  <button
                    onClick={() => setModalNovoNo(true)}
                    className="px-3 py-1.5 rounded-full font-semibold transition-all text-white text-sm"
                    style={{ background: colors.gradientButton }}
                  >
                    + Etapa
                  </button>
                </div>

                {/* Node List with Connection Lines */}
                <div className="space-y-1">
                  {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map((no, index) => {
                    const config = NODE_TYPE_CONFIG[no.tipo] || NODE_TYPE_CONFIG.mensagem;
                    const isExpanded = expandedNodeId === no.id;

                    return (
                      <React.Fragment key={no.id}>
                        {/* Connection line */}
                        {index > 0 && (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            padding: '2px 0',
                          }}>
                            <div style={{
                              width: 2,
                              height: 20,
                              background: `${colors.primary}44`,
                            }} />
                          </div>
                        )}

                        <div
                          className="rounded-lg cursor-pointer transition-all"
                          style={{
                            background: colors.inputBg,
                            borderLeft: `3px solid ${config.color}`,
                            border: `1px solid ${isExpanded ? config.color : colors.inputBorder}`,
                            borderLeftWidth: 3,
                            borderLeftColor: config.color,
                          }}
                          onClick={() => setExpandedNodeId(isExpanded ? null : (no.id || null))}
                        >
                          {/* Compact header */}
                          <div className="p-3 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{config.icon}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                                    {no.titulo || no.identificador}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                    background: `${config.color}22`,
                                    color: config.color,
                                    fontSize: 10,
                                  }}>
                                    {config.label}
                                  </span>
                                </div>
                                {!isExpanded && no.conteudo && (
                                  <p className="text-xs truncate max-w-[200px]" style={{ color: colors.textSecondary }}>
                                    {no.conteudo.substring(0, 60)}{no.conteudo.length > 60 ? '...' : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {no.opcoes.length > 0 && (
                                <span className="text-xs" style={{ color: colors.textSecondary }}>
                                  {no.opcoes.length} opções
                                </span>
                              )}
                              <span style={{ color: colors.textSecondary, fontSize: 12 }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </div>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-3 pb-3">
                              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                                ID: {no.identificador}
                              </p>

                              {no.conteudo && (
                                <div className="mb-2 p-2 rounded" style={{ background: colors.hoverBg }}>
                                  <p className="text-sm whitespace-pre-wrap" style={{ color: colors.textSecondary }}>
                                    {no.conteudo}
                                  </p>
                                </div>
                              )}

                              {/* Extra data for new types */}
                              {no.dados_extras && Object.keys(no.dados_extras).length > 0 && (
                                <div className="mb-2 p-2 rounded" style={{ background: `${config.color}0d` }}>
                                  {no.tipo === 'coletar_dado' && no.dados_extras.variavel ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs px-2 py-0.5 rounded" style={{
                                        background: `${config.color}22`,
                                        color: config.color,
                                        fontWeight: 600,
                                      }}>
                                        {DADOS_COLETAVEIS[no.dados_extras.variavel]?.label || no.dados_extras.variavel}
                                      </span>
                                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                                        Validacao: {DADOS_COLETAVEIS[no.dados_extras.variavel]?.validacao || '?'}
                                      </span>
                                    </div>
                                  ) : (
                                    Object.entries(no.dados_extras).map(([key, val]) => (
                                      <p key={key} className="text-xs" style={{ color: colors.textSecondary }}>
                                        <span style={{ color: config.color, fontWeight: 600 }}>{key}:</span> {String(val)}
                                      </p>
                                    ))
                                  )}
                                </div>
                              )}

                              {/* Next node reference */}
                              {no.proximo_no_id && (() => {
                                const nextNode = fluxoSelecionado?.nos.find(n => n.id === no.proximo_no_id);
                                const label = nextNode ? `${NODE_TYPE_CONFIG[nextNode.tipo]?.icon || '?'} ${nextNode.titulo || nextNode.identificador}` : `ID ${no.proximo_no_id}`;
                                return (
                                  <div className="mb-2 p-1.5 rounded flex items-center gap-1" style={{ background: `${colors.primary}0d` }}>
                                    <span className="text-xs" style={{ color: colors.primary }}>
                                      {'\u2192 ' + label}
                                    </span>
                                  </div>
                                );
                              })()}

                              {/* Options */}
                              {no.opcoes.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold" style={{ color: config.color }}>Opcoes:</p>
                                  {no.opcoes.sort((a, b) => a.ordem - b.ordem).map((opcao, oi) => (
                                    <div
                                      key={opcao.id || oi}
                                      className="p-1.5 rounded"
                                      style={{ background: `${config.color}0d` }}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="text-xs font-medium" style={{ color: colors.textPrimary }}>
                                          {opcao.titulo}
                                        </span>
                                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                                          {opcao.tipo}
                                        </span>
                                      </div>
                                      {opcao.proximo_no_id && (() => {
                                        const nextNode = fluxoSelecionado?.nos.find(n => n.id === opcao.proximo_no_id);
                                        const label = nextNode ? `${NODE_TYPE_CONFIG[nextNode.tipo]?.icon || '?'} ${nextNode.titulo || nextNode.identificador}` : `ID ${opcao.proximo_no_id}`;
                                        return (
                                          <span className="text-xs" style={{ color: colors.primary }}>
                                            {'\u2192 ' + label}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); abrirEdicaoNo(no); }}
                                  className="text-xs px-3 py-1 rounded-full transition-all"
                                  style={{
                                    background: `${colors.primary}22`,
                                    color: colors.primary
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); no.id && deletarNo(no.id); }}
                                  className="text-xs px-3 py-1 rounded-full transition-all"
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#ef4444'
                                  }}
                                >
                                  Deletar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {fluxoSelecionado.nos.length === 0 && (
                    <div className="text-center py-12" style={{ color: colors.textSecondary }}>
                      <p className="mb-2">Nenhuma etapa criada ainda</p>
                      <p className="text-xs">Clique em "+ Etapa" para começar</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-12 text-center" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
                <span className="text-5xl mb-4 block">🤖</span>
                <p className="text-lg mb-2" style={{ color: colors.textPrimary }}>
                  Selecione um fluxo
                </p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Escolha um fluxo na lista ao lado para começar a editar
                </p>
              </div>
            )}
          </div>

          {/* RIGHT: Chat Preview (col-span-4) */}
          <div className="col-span-4">
            <div className="rounded-2xl p-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
              <h2 className="text-lg font-bold mb-3" style={{ color: colors.textPrimary }}>
                Preview do Chat
              </h2>
              <BotChatPreview nos={fluxoSelecionado?.nos || []} />
            </div>
          </div>
        </div>
      </div>

      {/* Modal Novo Fluxo */}
      {modalNovoFluxo && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: colors.modalOverlay }}>
          <div className="rounded-2xl p-8 max-w-md w-full mx-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: colors.textPrimary }}>
              Novo Fluxo
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Nome do Fluxo
                </label>
                <input
                  type="text"
                  value={nomeFluxo}
                  onChange={(e) => setNomeFluxo(e.target.value)}
                  placeholder="Ex: Atendimento Padrão"
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Descrição
                </label>
                <textarea
                  value={descricaoFluxo}
                  onChange={(e) => setDescricaoFluxo(e.target.value)}
                  placeholder="Descreva o objetivo deste fluxo"
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={criarFluxo}
                disabled={!nomeFluxo}
                className="flex-1 py-3 rounded-full font-semibold transition-all disabled:opacity-50 text-white"
                style={{ background: colors.gradientButton }}
              >
                Criar Fluxo
              </button>
              <button
                onClick={() => {
                  setModalNovoFluxo(false);
                  setNomeFluxo('');
                  setDescricaoFluxo('');
                }}
                className="px-6 py-3 rounded-full font-semibold transition-all"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo No - Enhanced with new node types */}
      {modalNovoNo && fluxoSelecionado && (
        <div className="fixed inset-0 flex items-center justify-center z-50 overflow-y-auto" style={{ background: colors.modalOverlay }}>
          <div className="rounded-2xl p-8 max-w-2xl w-full mx-4 my-8" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: colors.textPrimary }}>
              Nova Etapa do Bot
            </h2>

            <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-2">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Identificador (unico)
                </label>
                <input
                  type="text"
                  value={novoNo.identificador}
                  onChange={(e) => setNovoNo({ ...novoNo, identificador: e.target.value })}
                  placeholder="Ex: saudacao, menu_principal"
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Tipo
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(NODE_TYPE_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setNovoNo({ ...novoNo, tipo: key, opcoes: [], dados_extras: {} })}
                      className="p-2 rounded-lg text-center transition-all"
                      style={{
                        background: novoNo.tipo === key ? `${config.color}22` : colors.hoverBg,
                        border: `1px solid ${novoNo.tipo === key ? config.color : 'transparent'}`,
                      }}
                    >
                      <span className="text-lg block">{config.icon}</span>
                      <span className="text-xs" style={{ color: novoNo.tipo === key ? config.color : colors.textSecondary }}>
                        {config.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Titulo (opcional)
                </label>
                <input
                  type="text"
                  value={novoNo.titulo}
                  onChange={(e) => setNovoNo({ ...novoNo, titulo: e.target.value })}
                  placeholder="Titulo da etapa"
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={inputStyle}
                />
              </div>

              {/* Content field - not for delay/webhook/pagamento */}
              {!['delay', 'webhook_externo', 'gerar_pagamento'].includes(novoNo.tipo) && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    {novoNo.tipo === 'condicional' ? 'Condição' :
                     novoNo.tipo === 'coletar_dado' ? 'Mensagem de solicitação' :
                     'Mensagem'}
                  </label>
                  <textarea
                    value={novoNo.conteudo}
                    onChange={(e) => setNovoNo({ ...novoNo, conteudo: e.target.value })}
                    placeholder={
                      novoNo.tipo === 'condicional' ? 'Ex: dados.cpf != null' :
                      novoNo.tipo === 'coletar_dado' ? 'Ex: Por favor, informe seu CPF:' :
                      'Digite a mensagem que o bot enviará'
                    }
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg outline-none resize-none"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Image upload for botoes and mensagem */}
              {['botoes', 'mensagem'].includes(novoNo.tipo) && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                    Imagem (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <label
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm"
                      style={{
                        background: colors.inputBg,
                        border: `1px dashed ${novoNo.dados_extras?.header_image_url ? colors.primary : colors.inputBorder}`,
                        color: colors.textSecondary,
                      }}
                    >
                      <span>{novoNo.dados_extras?.header_image_url ? '🖼️ Trocar imagem' : '📤 Carregar imagem'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Maximo 5MB.'); return; }
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await api.post('/bot-builder/upload-imagem', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            updateDadosExtras('header_image_url', res.data.url);
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Erro ao fazer upload');
                          }
                        }}
                      />
                    </label>
                    {novoNo.dados_extras?.header_image_url && (
                      <button
                        onClick={() => updateDadosExtras('header_image_url', '')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {novoNo.dados_extras?.header_image_url && (
                    <div style={{
                      marginTop: 6,
                      borderRadius: 8,
                      overflow: 'hidden',
                      height: 80,
                      background: `url(${resolveImageUrl(novoNo.dados_extras.header_image_url)}) center/cover no-repeat`,
                      backgroundColor: colors.hoverBg,
                      border: `1px solid ${colors.border}`,
                    }} />
                  )}
                  <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Envia imagem acima da mensagem no WhatsApp
                  </p>
                </div>
              )}

              {/* === NEW NODE TYPE FIELDS === */}

              {/* Coletar Dado - Dropdown fixo de tipos */}
              {novoNo.tipo === 'coletar_dado' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.coletar_dado.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Qual dado coletar?
                    </label>
                    <select
                      value={novoNo.dados_extras?.variavel || ''}
                      onChange={(e) => {
                        const key = e.target.value;
                        const config = DADOS_COLETAVEIS[key];
                        setNovoNo({
                          ...novoNo,
                          conteudo: config ? config.placeholder : '',
                          dados_extras: {
                            ...novoNo.dados_extras,
                            variavel: key,
                            validacao: config ? config.validacao : 'texto',
                          }
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="">-- Selecione o dado --</option>
                      {(() => {
                        const grupos: Record<string, string[]> = {};
                        Object.entries(DADOS_COLETAVEIS).forEach(([key, cfg]) => {
                          if (!grupos[cfg.grupo]) grupos[cfg.grupo] = [];
                          grupos[cfg.grupo].push(key);
                        });
                        return Object.entries(grupos).map(([grupo, keys]) => (
                          <optgroup key={grupo} label={grupo}>
                            {keys.map(key => (
                              <option key={key} value={key}>{DADOS_COLETAVEIS[key].label}</option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  </div>
                  {novoNo.dados_extras?.variavel && DADOS_COLETAVEIS[novoNo.dados_extras.variavel] && (
                    <>
                      <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                        <span style={{
                          background: `${NODE_TYPE_CONFIG.coletar_dado.color}22`,
                          color: NODE_TYPE_CONFIG.coletar_dado.color,
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}>
                          {DADOS_COLETAVEIS[novoNo.dados_extras.variavel].validacao}
                        </span>
                        <span>Salva automaticamente no cadastro do cliente</span>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={novoNo.dados_extras?.pular_se_preenchido || false}
                          onChange={(e) => updateDadosExtras('pular_se_preenchido', e.target.checked)}
                          style={{ accentColor: NODE_TYPE_CONFIG.coletar_dado.color }}
                        />
                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                          Pular se ja preenchido (bot reconhece cliente cadastrado)
                        </span>
                      </label>
                    </>
                  )}
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    A mensagem de solicitacao acima sera preenchida automaticamente, mas voce pode editar.
                  </p>
                </div>
              )}

              {/* Condicional */}
              {novoNo.tipo === 'condicional' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.condicional.color}0d` }}>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                    Formatos de condicao suportados:
                  </p>
                  <div className="space-y-1">
                    {[
                      { code: 'cliente_has:cpf', desc: 'Cliente tem CPF cadastrado?' },
                      { code: 'cliente_has:email', desc: 'Cliente tem email?' },
                      { code: 'cliente_has:nome_completo', desc: 'Cliente tem nome?' },
                      { code: 'variavel == valor', desc: 'Dado coletado igual a valor' },
                      { code: 'variavel != valor', desc: 'Dado coletado diferente de valor' },
                      { code: 'variavel exists', desc: 'Dado coletado existe?' },
                    ].map(item => (
                      <div key={item.code} className="flex items-center gap-2">
                        <code
                          className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                          style={{
                            background: `${NODE_TYPE_CONFIG.condicional.color}22`,
                            color: NODE_TYPE_CONFIG.condicional.color,
                          }}
                          onClick={() => setNovoNo({ ...novoNo, conteudo: item.code })}
                        >
                          {item.code}
                        </code>
                        <span className="text-xs" style={{ color: colors.textSecondary }}>{item.desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Clique em uma condicao para usar. Configure caminhos verdadeiro/falso nas opcoes abaixo.
                  </p>
                </div>
              )}

              {/* Delay */}
              {novoNo.tipo === 'delay' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.delay.color}0d` }}>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Duração
                      </label>
                      <input
                        type="number"
                        value={novoNo.dados_extras?.duracao || ''}
                        onChange={(e) => updateDadosExtras('duracao', Number(e.target.value))}
                        placeholder="5"
                        min="1"
                        className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Unidade
                      </label>
                      <select
                        value={novoNo.dados_extras?.unidade || 'segundos'}
                        onChange={(e) => updateDadosExtras('unidade', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                        style={inputStyle}
                      >
                        <option value="segundos">Segundos</option>
                        <option value="minutos">Minutos</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Webhook Externo */}
              {novoNo.tipo === 'webhook_externo' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.webhook_externo.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      URL
                    </label>
                    <input
                      type="text"
                      value={novoNo.dados_extras?.url || ''}
                      onChange={(e) => updateDadosExtras('url', e.target.value)}
                      placeholder="https://api.exemplo.com/webhook"
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Método HTTP
                    </label>
                    <select
                      value={novoNo.dados_extras?.method || 'POST'}
                      onChange={(e) => updateDadosExtras('method', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Gerar Pagamento (PIX) */}
              {novoNo.tipo === 'gerar_pagamento' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.gerar_pagamento.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={novoNo.dados_extras?.valor || ''}
                      onChange={(e) => updateDadosExtras('valor', e.target.value)}
                      placeholder="Ex: 29.90"
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Descricao do pagamento
                    </label>
                    <input
                      type="text"
                      value={novoNo.dados_extras?.descricao || ''}
                      onChange={(e) => updateDadosExtras('descricao', e.target.value)}
                      placeholder="Ex: Servico de limpeza"
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Requer Mercado Pago configurado na empresa. Gera PIX automaticamente.
                  </p>
                </div>
              )}

              {/* Proximo No - for mensagem, coletar_dado, delay, webhook, gerar_pagamento */}
              {['mensagem', 'coletar_dado', 'delay', 'webhook_externo', 'gerar_pagamento', 'transferir_atendente'].includes(novoNo.tipo) && fluxoSelecionado && fluxoSelecionado.nos.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    Proximo no (avancar para)
                  </label>
                  <select
                    value={novoNo.proximo_no_id || ''}
                    onChange={(e) => setNovoNo({ ...novoNo, proximo_no_id: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                    style={inputStyle}
                  >
                    <option value="">Nenhum (fim do fluxo)</option>
                    {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map((n) => (
                      <option key={n.id} value={n.id}>
                        {NODE_TYPE_CONFIG[n.tipo]?.icon || '?'} {n.titulo || n.identificador}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Options (for lista, botoes, condicional) */}
              {(novoNo.tipo === 'lista' || novoNo.tipo === 'botoes' || novoNo.tipo === 'condicional') && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                      {novoNo.tipo === 'lista' ? 'Itens da Lista' :
                       novoNo.tipo === 'condicional' ? 'Caminhos (Verdadeiro/Falso)' :
                       'Botões'}
                    </label>
                    <button
                      onClick={adicionarOpcao}
                      className="text-sm px-3 py-1 rounded-full"
                      style={{
                        background: `${colors.primary}33`,
                        color: colors.primary
                      }}
                    >
                      + Adicionar
                    </button>
                  </div>

                  <div className="space-y-3">
                    {novoNo.opcoes.map((opcao, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg"
                        style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}` }}
                      >
                        <input
                          type="text"
                          value={opcao.titulo}
                          onChange={(e) => atualizarOpcao(index, 'titulo', e.target.value)}
                          placeholder={novoNo.tipo === 'condicional' ? (index === 0 ? 'Verdadeiro' : 'Falso') : 'Titulo'}
                          className="w-full px-3 py-2 rounded mb-2 outline-none"
                          style={{
                            background: colors.hoverBg,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary
                          }}
                        />
                        {novoNo.tipo === 'lista' && (
                          <input
                            type="text"
                            value={opcao.descricao || ''}
                            onChange={(e) => atualizarOpcao(index, 'descricao', e.target.value)}
                            placeholder="Descricao (opcional)"
                            className="w-full px-3 py-2 rounded mb-2 outline-none"
                            style={{
                              background: colors.hoverBg,
                              border: `1px solid ${colors.border}`,
                              color: colors.textPrimary
                            }}
                          />
                        )}
                        {/* Proximo no selector for each option */}
                        {fluxoSelecionado && fluxoSelecionado.nos.length > 0 && (
                          <select
                            value={opcao.proximo_no_id || ''}
                            onChange={(e) => atualizarOpcao(index, 'proximo_no_id', e.target.value ? e.target.value : '')}
                            className="w-full px-3 py-2 rounded mb-2 outline-none text-xs"
                            style={{
                              background: colors.hoverBg,
                              border: `1px solid ${colors.border}`,
                              color: colors.textPrimary
                            }}
                          >
                            <option value="">Ir para... (proximo no)</option>
                            {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map((n) => (
                              <option key={n.id} value={n.id}>
                                {NODE_TYPE_CONFIG[n.tipo]?.icon || '?'} {n.titulo || n.identificador}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => removerOpcao(index)}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#ef4444'
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={criarNo}
                disabled={!novoNo.identificador || (!novoNo.conteudo && !['delay', 'webhook_externo', 'gerar_pagamento', 'transferir_atendente'].includes(novoNo.tipo))}
                className="flex-1 py-3 rounded-full font-semibold transition-all disabled:opacity-50 text-white"
                style={{ background: colors.gradientButton }}
              >
                Criar Etapa
              </button>
              <button
                onClick={() => {
                  setModalNovoNo(false);
                  setNovoNo({
                    identificador: '',
                    tipo: 'mensagem',
                    titulo: '',
                    conteudo: '',
                    dados_extras: {},
                    ordem: 0,
                    opcoes: []
                  });
                }}
                className="px-6 py-3 rounded-full font-semibold transition-all"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar No */}
      {modalEditarNo && noEditando && fluxoSelecionado && (
        <div className="fixed inset-0 flex items-center justify-center z-50 overflow-y-auto" style={{ background: colors.modalOverlay }}>
          <div className="rounded-2xl p-8 max-w-2xl w-full mx-4 my-8" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: colors.textPrimary }}>
              Editar Etapa
            </h2>

            <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-2">
              {/* Identificador */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Identificador
                </label>
                <input
                  type="text"
                  value={noEditando.identificador}
                  onChange={(e) => setNoEditando({ ...noEditando, identificador: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={inputStyle}
                />
              </div>

              {/* Titulo */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Titulo
                </label>
                <input
                  type="text"
                  value={noEditando.titulo || ''}
                  onChange={(e) => setNoEditando({ ...noEditando, titulo: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={inputStyle}
                />
              </div>

              {/* Tipo (read-only badge) */}
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: colors.textSecondary }}>Tipo:</span>
                <span className="text-sm px-2 py-0.5 rounded" style={{
                  background: `${(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).color}22`,
                  color: (NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).color,
                  fontWeight: 600,
                }}>
                  {(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).icon} {(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).label}
                </span>
              </div>

              {/* Conteudo / Mensagem */}
              {!['delay', 'webhook_externo', 'gerar_pagamento'].includes(noEditando.tipo) && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    {noEditando.tipo === 'coletar_dado' ? 'Mensagem de solicitacao' : 'Mensagem'}
                  </label>
                  <textarea
                    value={noEditando.conteudo || ''}
                    onChange={(e) => setNoEditando({ ...noEditando, conteudo: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg outline-none resize-none"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Image upload for botoes/mensagem */}
              {['botoes', 'mensagem'].includes(noEditando.tipo) && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                    Imagem (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <label
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm"
                      style={{
                        background: colors.inputBg,
                        border: `1px dashed ${noEditando.dados_extras?.header_image_url ? colors.primary : colors.inputBorder}`,
                        color: colors.textSecondary,
                      }}
                    >
                      <span>{noEditando.dados_extras?.header_image_url ? '🖼️ Trocar imagem' : '📤 Carregar imagem'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Maximo 5MB.'); return; }
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await api.post('/bot-builder/upload-imagem', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                            updateEditDadosExtras('header_image_url', res.data.url);
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Erro ao fazer upload');
                          }
                        }}
                      />
                    </label>
                    {noEditando.dados_extras?.header_image_url && (
                      <button
                        onClick={() => updateEditDadosExtras('header_image_url', '')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {noEditando.dados_extras?.header_image_url && (
                    <div style={{
                      marginTop: 6, borderRadius: 8, overflow: 'hidden', height: 80,
                      background: `url(${resolveImageUrl(noEditando.dados_extras.header_image_url)}) center/cover no-repeat`,
                      backgroundColor: colors.hoverBg, border: `1px solid ${colors.border}`,
                    }} />
                  )}
                </div>
              )}

              {/* Coletar dado - dropdown fixo */}
              {noEditando.tipo === 'coletar_dado' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.coletar_dado.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Qual dado coletar?
                    </label>
                    <select
                      value={noEditando.dados_extras?.variavel || ''}
                      onChange={(e) => {
                        const key = e.target.value;
                        const cfg = DADOS_COLETAVEIS[key];
                        setNoEditando({
                          ...noEditando,
                          conteudo: cfg ? cfg.placeholder : noEditando.conteudo,
                          dados_extras: { ...noEditando.dados_extras, variavel: key, validacao: cfg ? cfg.validacao : 'texto' }
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="">-- Selecione o dado --</option>
                      {(() => {
                        const grupos: Record<string, string[]> = {};
                        Object.entries(DADOS_COLETAVEIS).forEach(([key, cfg]) => {
                          if (!grupos[cfg.grupo]) grupos[cfg.grupo] = [];
                          grupos[cfg.grupo].push(key);
                        });
                        return Object.entries(grupos).map(([grupo, keys]) => (
                          <optgroup key={grupo} label={grupo}>
                            {keys.map(key => (
                              <option key={key} value={key}>{DADOS_COLETAVEIS[key].label}</option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  </div>
                  {noEditando.dados_extras?.variavel && DADOS_COLETAVEIS[noEditando.dados_extras.variavel] && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noEditando.dados_extras?.pular_se_preenchido || false}
                        onChange={(e) => updateEditDadosExtras('pular_se_preenchido', e.target.checked)}
                        style={{ accentColor: NODE_TYPE_CONFIG.coletar_dado.color }}
                      />
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        Pular se ja preenchido (bot reconhece cliente cadastrado)
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Delay fields */}
              {noEditando.tipo === 'delay' && (
                <div className="flex gap-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.delay.color}0d` }}>
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Duracao</label>
                    <input
                      type="number"
                      value={noEditando.dados_extras?.duracao || ''}
                      onChange={(e) => updateEditDadosExtras('duracao', Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Unidade</label>
                    <select
                      value={noEditando.dados_extras?.unidade || 'segundos'}
                      onChange={(e) => updateEditDadosExtras('unidade', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="segundos">Segundos</option>
                      <option value="minutos">Minutos</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Webhook fields */}
              {noEditando.tipo === 'webhook_externo' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.webhook_externo.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>URL</label>
                    <input
                      type="text"
                      value={noEditando.dados_extras?.url || ''}
                      onChange={(e) => updateEditDadosExtras('url', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Metodo</label>
                    <select
                      value={noEditando.dados_extras?.method || 'POST'}
                      onChange={(e) => updateEditDadosExtras('method', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Pagamento fields */}
              {noEditando.tipo === 'gerar_pagamento' && (
                <div className="space-y-3 p-3 rounded-lg" style={{ background: `${NODE_TYPE_CONFIG.gerar_pagamento.color}0d` }}>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={noEditando.dados_extras?.valor || ''}
                      onChange={(e) => updateEditDadosExtras('valor', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Descricao</label>
                    <input
                      type="text"
                      value={noEditando.dados_extras?.descricao || ''}
                      onChange={(e) => updateEditDadosExtras('descricao', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {/* Proximo no */}
              {['mensagem', 'coletar_dado', 'delay', 'webhook_externo', 'gerar_pagamento', 'transferir_atendente'].includes(noEditando.tipo) && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    Proximo no
                  </label>
                  <select
                    value={noEditando.proximo_no_id || ''}
                    onChange={(e) => setNoEditando({ ...noEditando, proximo_no_id: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                    style={inputStyle}
                  >
                    <option value="">Nenhum (fim do fluxo)</option>
                    {fluxoSelecionado.nos.filter(n => n.id !== noEditando.id).sort((a, b) => a.ordem - b.ordem).map((n) => (
                      <option key={n.id} value={n.id}>
                        {NODE_TYPE_CONFIG[n.tipo]?.icon || '?'} {n.titulo || n.identificador}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Opcoes (lista, botoes, condicional) */}
              {['lista', 'botoes', 'condicional'].includes(noEditando.tipo) && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                      {noEditando.tipo === 'lista' ? 'Itens da Lista' : noEditando.tipo === 'condicional' ? 'Caminhos' : 'Botoes'}
                    </label>
                    <button
                      onClick={adicionarOpcaoEdit}
                      className="text-sm px-3 py-1 rounded-full"
                      style={{ background: `${colors.primary}33`, color: colors.primary }}
                    >
                      + Adicionar
                    </button>
                  </div>
                  <div className="space-y-3">
                    {noEditando.opcoes.map((opcao, index) => (
                      <div key={opcao.id || `new-${index}`} className="p-3 rounded-lg" style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}` }}>
                        <input
                          type="text"
                          value={opcao.titulo}
                          onChange={(e) => atualizarOpcaoEdit(index, 'titulo', e.target.value)}
                          placeholder="Titulo"
                          className="w-full px-3 py-2 rounded mb-2 outline-none"
                          style={{ background: colors.hoverBg, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                        {noEditando.tipo === 'lista' && (
                          <input
                            type="text"
                            value={opcao.descricao || ''}
                            onChange={(e) => atualizarOpcaoEdit(index, 'descricao', e.target.value)}
                            placeholder="Descricao (opcional)"
                            className="w-full px-3 py-2 rounded mb-2 outline-none"
                            style={{ background: colors.hoverBg, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                          />
                        )}
                        <select
                          value={opcao.proximo_no_id || ''}
                          onChange={(e) => atualizarOpcaoEdit(index, 'proximo_no_id', e.target.value)}
                          className="w-full px-3 py-2 rounded mb-2 outline-none text-xs"
                          style={{ background: colors.hoverBg, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        >
                          <option value="">Ir para... (proximo no)</option>
                          {fluxoSelecionado.nos.filter(n => n.id !== noEditando.id).sort((a, b) => a.ordem - b.ordem).map((n) => (
                            <option key={n.id} value={n.id}>
                              {NODE_TYPE_CONFIG[n.tipo]?.icon || '?'} {n.titulo || n.identificador}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => removerOpcaoEdit(index)}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={salvarEdicaoNo}
                className="flex-1 py-3 rounded-full font-semibold transition-all text-white"
                style={{ background: colors.gradientButton }}
              >
                Salvar Alteracoes
              </button>
              <button
                onClick={() => { setModalEditarNo(false); setNoEditando(null); }}
                className="px-6 py-3 rounded-full font-semibold transition-all"
                style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotBuilder;
