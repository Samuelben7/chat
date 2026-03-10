import React, { useState, useEffect, useRef } from 'react';
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
const DADOS_COLETAVEIS: Record<string, { label: string; validacao: string; placeholder: string; grupo: string; emoji: string; validacaoDesc: string }> = {
  nome_completo:       { label: 'Nome Completo',      validacao: 'nao_vazio', placeholder: 'Por favor, informe seu nome completo:',        grupo: 'Pessoal',      emoji: '👤', validacaoDesc: 'Texto obrigatório' },
  cpf:                 { label: 'CPF',                validacao: 'cpf',       placeholder: 'Informe seu CPF (apenas números):',            grupo: 'Pessoal',      emoji: '🪪', validacaoDesc: '11 dígitos numéricos' },
  rg:                  { label: 'RG',                 validacao: 'nao_vazio', placeholder: 'Informe seu RG:',                              grupo: 'Pessoal',      emoji: '📄', validacaoDesc: 'Texto obrigatório' },
  email:               { label: 'E-mail',             validacao: 'email',     placeholder: 'Informe seu e-mail:',                          grupo: 'Pessoal',      emoji: '📧', validacaoDesc: 'formato@email.com' },
  data_nascimento:     { label: 'Data de Nascimento', validacao: 'data',      placeholder: 'Informe sua data de nascimento (DD/MM/AAAA):', grupo: 'Pessoal',      emoji: '🎂', validacaoDesc: 'DD/MM/AAAA' },
  telefone_secundario: { label: 'Telefone',           validacao: 'telefone',  placeholder: 'Informe um telefone de contato com DDD:',      grupo: 'Pessoal',      emoji: '📱', validacaoDesc: 'DDD + número' },
  endereco:            { label: 'Endereço',           validacao: 'nao_vazio', placeholder: 'Informe seu endereço (rua e número):',         grupo: 'Endereço',     emoji: '🏠', validacaoDesc: 'Rua e número' },
  complemento:         { label: 'Complemento',        validacao: 'texto',     placeholder: 'Informe o complemento (apto, bloco, etc):',   grupo: 'Endereço',     emoji: '🏢', validacaoDesc: 'Texto livre' },
  bairro:              { label: 'Bairro',             validacao: 'nao_vazio', placeholder: 'Informe seu bairro:',                          grupo: 'Endereço',     emoji: '📍', validacaoDesc: 'Texto obrigatório' },
  cidade:              { label: 'Cidade',             validacao: 'nao_vazio', placeholder: 'Informe sua cidade:',                          grupo: 'Endereço',     emoji: '🏙️', validacaoDesc: 'Texto obrigatório' },
  estado:              { label: 'Estado (UF)',        validacao: 'nao_vazio', placeholder: 'Informe seu estado (ex: SP, RJ, MG):',         grupo: 'Endereço',     emoji: '🗺️', validacaoDesc: 'Sigla do estado' },
  pais:                { label: 'País',               validacao: 'nao_vazio', placeholder: 'Informe seu país:',                            grupo: 'Endereço',     emoji: '🌎', validacaoDesc: 'Texto obrigatório' },
  cep:                 { label: 'CEP',                validacao: 'cep',       placeholder: 'Informe seu CEP (8 dígitos):',                 grupo: 'Endereço',     emoji: '📮', validacaoDesc: '8 dígitos numéricos' },
  chave_pix:           { label: 'Chave PIX',          validacao: 'nao_vazio', placeholder: 'Informe sua chave PIX:',                       grupo: 'Financeiro',   emoji: '💰', validacaoDesc: 'CPF, e-mail, telefone ou chave aleatória' },
  profissao:           { label: 'Profissão',          validacao: 'texto',     placeholder: 'Qual sua profissão?',                          grupo: 'Profissional', emoji: '💼', validacaoDesc: 'Texto livre' },
  empresa_cliente:     { label: 'Nome da Empresa',    validacao: 'texto',     placeholder: 'Informe o nome da sua empresa:',               grupo: 'Profissional', emoji: '🏭', validacaoDesc: 'Texto livre' },
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

// ==================== INTERACTIVE CHAT PREVIEW (IPHONE STYLE PREMIUM) ====================

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
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const nodesById: Record<number, BotFluxoNo> = {};
  const nodesByIdent: Record<string, BotFluxoNo> = {};
  nos.forEach(n => {
    if (n.id) nodesById[n.id] = n;
    nodesByIdent[n.identificador] = n;
  });

  const bubbleBgBot = theme === 'whatsapp' ? (theme === 'dark' ? '#1B272E' : '#FFFFFF') : colors.cardBg;
  const bubbleBgUser = theme === 'whatsapp' ? (theme === 'dark' ? '#005C4B' : '#D9FDD3') : colors.primary;
  const bubbleText = theme === 'whatsapp' ? (theme === 'dark' ? '#E9EDEF' : '#111B21') : colors.textPrimary;
  const secondaryText = theme === 'whatsapp' ? (theme === 'dark' ? '#8696A0' : '#667781') : colors.textSecondary;

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const simulateNode = (node: BotFluxoNo, history: ChatMessage[]): ChatMessage[] => {
    const newHistory = [...history];
    const config = NODE_TYPE_CONFIG[node.tipo] || NODE_TYPE_CONFIG.mensagem;

    if (node.tipo === 'mensagem') {
      newHistory.push({ type: 'bot', content: node.conteudo || '', node });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'botoes') {
      const sortedOpts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem).slice(0, 3);
      newHistory.push({ type: 'bot', content: node.conteudo || 'Escolha uma opção:', node, buttons: sortedOpts });
    } else if (node.tipo === 'lista') {
      const sortedOpts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem).slice(0, 10);
      newHistory.push({ type: 'bot', content: node.conteudo || 'Selecione uma opção:', node, listItems: sortedOpts });
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
      newHistory.push({ type: 'system', content: `${config.icon} Chamando webhook...` });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'condicional') {
      newHistory.push({ type: 'system', content: `${config.icon} Condição: ${node.dados_extras?.condicao || node.conteudo || '...'}` });
      const opts = [...(node.opcoes || [])].sort((a, b) => a.ordem - b.ordem);
      if (opts.length > 0 && opts[0].proximo_no_id && nodesById[opts[0].proximo_no_id]) {
        return simulateNode(nodesById[opts[0].proximo_no_id], newHistory);
      }
    } else if (node.tipo === 'gerar_pagamento') {
      const valor = node.dados_extras?.valor || '0.00';
      newHistory.push({
        type: 'bot',
        content: `💰 Pagamento PIX gerado!\n\nValor: R$ ${parseFloat(valor).toFixed(2)}\n\nCódigo PIX:\n00020126360014BR.GOV.BCB.PIX...`,
        node
      });
      if (node.proximo_no_id && nodesById[node.proximo_no_id]) {
        return simulateNode(nodesById[node.proximo_no_id], newHistory);
      }
    }

    return newHistory;
  };

  const startSimulation = () => {
    const startNode = nodesByIdent['inicio'] || (nos.length > 0 ? [...nos].sort((a, b) => a.ordem - b.ordem)[0] : null);
    if (!startNode) {
      setChatHistory([]);
      return;
    }
    const history = simulateNode(startNode, []);
    setChatHistory(history);
    scrollToBottom();
  };

  useEffect(() => {
    startSimulation();
  }, [nos]);

  const handleOptionClick = (opcao: BotFluxoOpcao) => {
    const newHistory = [...chatHistory, { type: 'user' as const, content: opcao.titulo }];
    if (opcao.proximo_no_id && nodesById[opcao.proximo_no_id]) {
      const result = simulateNode(nodesById[opcao.proximo_no_id], newHistory);
      setChatHistory(result);
    } else {
      setChatHistory([...newHistory, { type: 'system' as const, content: '(Fim do fluxo)' }]);
    }
    setShowListModal(false);
    scrollToBottom();
  };

  const handleUserInput = () => {
    if (!inputText.trim()) return;
    const lastBotMsg = [...chatHistory].reverse().find(m => m.type === 'bot' && m.node);
    const newHistory = [...chatHistory, { type: 'user' as const, content: inputText }];
    setInputText('');

    if (lastBotMsg?.node?.proximo_no_id && nodesById[lastBotMsg.node.proximo_no_id]) {
      const result = simulateNode(nodesById[lastBotMsg.node.proximo_no_id], newHistory);
      setChatHistory(result);
    } else {
      setChatHistory([...newHistory, { type: 'system' as const, content: '(Fim do fluxo)' }]);
    }
    scrollToBottom();
  };

  const lastMsg = chatHistory[chatHistory.length - 1];
  const needsInput = lastMsg?.type === 'bot' && lastMsg.node?.tipo === 'coletar_dado';

  return (
    <div className="flex justify-center items-center py-6 rounded-[3rem] border transition-all duration-700 shadow-[0_20px_50px_rgba(0,0,0,0.2)]" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.02)', borderColor: colors.border }}>
      {/* FRAME DO IPHONE REALISTA PREMIUM */}
      <div className="relative w-[300px] h-[610px] bg-[#000] rounded-[3.5rem] border-[10px] border-[#1a1a1a] shadow-2xl overflow-hidden scale-95 origin-top ring-2 ring-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-[#1a1a1a] rounded-b-3xl z-50 flex items-center justify-center gap-2">
           <div className="w-12 h-1.5 bg-white/10 rounded-full" />
           <div className="w-2 h-2 rounded-full bg-white/10" />
        </div>
        
        {/* WhatsApp Header Mockup Premium */}
        <div className="absolute top-0 w-full h-24 flex items-end p-4 z-30 shadow-md" style={{ background: theme === 'whatsapp' ? (theme === 'dark' ? '#202C33' : '#075E54') : colors.sidebarBg }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white text-[10px] border border-white/20 font-black shadow-lg">🤖</div>
            <div className="flex flex-col">
              <span className="text-white text-[12px] font-black uppercase tracking-tight">Bot Simulator</span>
              <span className="text-white/60 text-[9px] font-bold flex items-center gap-1">online <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /></span>
            </div>
          </div>
          <button onClick={startSimulation} className="ml-auto mb-1 text-[12px] text-white/50 hover:text-white transition-colors">↻</button>
        </div>

        <div className="w-full h-full pt-24 pb-12 px-3 flex flex-col justify-start overflow-hidden relative" style={{ backgroundImage: `url(${whatsappBg})`, backgroundSize: 'cover', backgroundBlendMode: theme === 'dark' ? 'multiply' : 'normal', backgroundColor: theme === 'dark' ? '#0B141A' : 'transparent' }}>
          
          <div className="flex flex-col items-start w-full mt-2 space-y-3 relative z-10 no-scrollbar overflow-y-auto max-h-full pb-10">
            {chatHistory.length === 0 ? (
              <div className="w-full text-center py-24 opacity-30">
                <span className="text-5xl block mb-4">🤖</span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>Inicie o fluxo</span>
              </div>
            ) : (
              chatHistory.map((msg, i) => {
                if (msg.type === 'system') {
                  return (
                    <div key={i} className="w-full flex justify-center py-1">
                      <span className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-black/20 text-white/50 backdrop-blur-md border border-white/5">
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                if (msg.type === 'user') {
                  return (
                    <div key={i} className="w-full flex justify-end">
                      <div className="max-w-[85%] relative p-2.5 shadow-xl" style={{ background: bubbleBgUser, borderRadius: '15px 0 15px 15px' }}>
                        <p className="text-[12px] leading-tight font-medium" style={{ color: theme === 'dark' ? '#fff' : '#111' }}>{msg.content}</p>
                        <div className="flex justify-end mt-1 items-center gap-1">
                          <span className="text-[9px] opacity-50" style={{ color: theme === 'dark' ? '#fff' : '#111' }}>12:01</span>
                          <span className="text-[12px] leading-none text-blue-400">✓✓</span>
                        </div>
                        <div className="absolute top-0 -right-1.5 w-3 h-3" style={{ backgroundColor: bubbleBgUser, clipPath: 'polygon(0 0, 0 100%, 100% 0)' }} />
                      </div>
                    </div>
                  );
                }

                const headerImg = msg.node?.dados_extras?.header_image_url;
                return (
                  <div key={i} className="w-full flex justify-start">
                    <div className="max-w-[85%] relative shadow-xl overflow-hidden border border-black/5" style={{ background: bubbleBgBot, borderRadius: '0 15px 15px 15px' }}>
                      {headerImg && (
                        <div className="w-full aspect-video bg-black/5">
                          <img src={resolveImageUrl(headerImg)} alt="header" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-3.5">
                        {msg.node?.titulo && <p className="text-[11px] font-black uppercase mb-1 tracking-tight" style={{ color: colors.primary }}>{msg.node.titulo}</p>}
                        <p className="text-[12px] leading-relaxed font-medium whitespace-pre-wrap" style={{ color: bubbleText }}>{msg.content}</p>
                        <div className="flex justify-end mt-1">
                          <span className="text-[9px] opacity-50" style={{ color: secondaryText }}>12:00</span>
                        </div>
                      </div>

                      {/* Botões Interativos */}
                      {msg.buttons && msg.buttons.length > 0 && i === chatHistory.length - 1 && (
                        <div className="flex flex-col border-t divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                          {msg.buttons.map((opt, oi) => (
                            <button
                              key={oi}
                              onClick={() => handleOptionClick(opt)}
                              className="w-full py-3 text-[11px] font-black uppercase tracking-tight text-blue-500 hover:bg-black/5 transition-colors"
                            >
                              {opt.titulo}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Lista */}
                      {msg.listItems && msg.listItems.length > 0 && i === chatHistory.length - 1 && (
                        <button
                          onClick={() => { setCurrentListItems(msg.listItems!); setShowListModal(true); }}
                          className="w-full py-3 border-t text-[11px] font-black uppercase tracking-tight text-blue-500 hover:bg-black/5 transition-colors flex items-center justify-center gap-2"
                          style={{ borderColor: 'rgba(0,0,0,0.05)' }}
                        >
                          📋 Ver opções
                        </button>
                      )}
                    </div>
                    {/* Tail do Balão */}
                    <div className="absolute top-0 -left-1.5 w-3 h-3" style={{ backgroundColor: bubbleBgBot, clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input area mockup premium */}
        <div className="absolute bottom-0 w-full p-3 bg-black/20 backdrop-blur-xl border-t border-white/5 flex gap-2 items-center z-40">
          <div className="flex-1 bg-white/10 rounded-2xl px-4 py-2 flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUserInput()}
              placeholder={needsInput ? "Responda aqui..." : "Simulação ativa"}
              disabled={!needsInput}
              className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/30 font-medium"
            />
          </div>
          <button onClick={handleUserInput} className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
             </svg>
          </button>
        </div>

        {/* List Modal — Bottom Sheet */}
        {showListModal && (
          <div className="absolute inset-0 z-50 bg-black/50 flex flex-col justify-end" style={{ animation: 'fadeIn .2s ease' }}>
            <div className="bg-white rounded-t-[1.5rem] p-4 flex flex-col shadow-2xl" style={{ maxHeight: '72%' }}>
              {/* Handle */}
              <div className="w-8 h-1 bg-gray-200 rounded-full mx-auto mb-3 flex-shrink-0" />

              {/* Título */}
              <div className="flex items-center justify-between mb-3 flex-shrink-0 px-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-700">Selecione uma opção</span>
                <button onClick={() => setShowListModal(false)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[14px] hover:bg-gray-200 transition-colors">×</button>
              </div>

              {/* Lista */}
              <div className="overflow-y-auto space-y-1.5 flex-1 pb-2">
                {currentListItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleOptionClick(item)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-left hover:bg-blue-50 hover:border-blue-200 active:scale-[0.98] transition-all flex flex-col gap-0.5 group"
                  >
                    <span className="text-[11px] font-bold text-gray-800 group-hover:text-blue-600 transition-colors leading-tight">{item.titulo}</span>
                    {item.descricao && <span className="text-[10px] text-gray-400 leading-tight">{item.descricao}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}      </div>
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

  // Campos customizados da empresa
  const [camposCustom, setCamposCustom] = useState<Array<{ id: number; nome: string; slug: string; tipo: string; obrigatorio: boolean }>>([]);

  // Gerador de Cadastro
  const [modalGerador, setModalGerador] = useState(false);
  const [camposSelecionados, setCamposSelecionados] = useState<string[]>(['nome_completo']);
  const [nomeFluxoGerador, setNomeFluxoGerador] = useState('Cadastro de Clientes');
  const [ativarAoCriar, setAtivarAoCriar] = useState(true);
  const [gerandoFluxo, setGerandoFluxo] = useState(false);

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
    carregarCamposCustom();
  }, []);

  const carregarCamposCustom = async () => {
    try {
      const response = await api.get('/clientes/campos-custom/');
      setCamposCustom(response.data);
    } catch (error) {
      console.error('Erro ao carregar campos custom:', error);
    }
  };

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

  const toggleCampo = (campo: string) => {
    setCamposSelecionados(prev =>
      prev.includes(campo) ? prev.filter(c => c !== campo) : [...prev, campo]
    );
  };

  const selecionarGrupo = (grupo: string) => {
    let camposGrupo: string[];
    if (grupo === 'Personalizado') {
      camposGrupo = camposCustom.map(c => `custom_${c.slug}`);
    } else {
      camposGrupo = Object.entries(DADOS_COLETAVEIS)
        .filter(([, cfg]) => cfg.grupo === grupo)
        .map(([key]) => key);
    }
    const todosSelecionados = camposGrupo.every(c => camposSelecionados.includes(c));
    if (todosSelecionados) {
      setCamposSelecionados(prev => prev.filter(c => !camposGrupo.includes(c)));
    } else {
      setCamposSelecionados(prev => [...new Set([...prev, ...camposGrupo])]);
    }
  };

  // Rótulo amigável para exibir no preview e descrição do fluxo
  const getLabelCampo = (key: string): string => {
    if (key.startsWith('custom_')) {
      const slug = key.replace('custom_', '');
      return camposCustom.find(c => c.slug === slug)?.nome || slug;
    }
    return DADOS_COLETAVEIS[key]?.label || key;
  };

  const gerarFluxoCadastro = async () => {
    if (camposSelecionados.length === 0) {
      alert('Selecione pelo menos um campo!');
      return;
    }
    setGerandoFluxo(true);
    try {
      // 1. Criar fluxo
      const fluxoRes = await api.post('/bot-builder/fluxos', {
        nome: nomeFluxoGerador || 'Cadastro de Clientes',
        descricao: `Coleta: ${camposSelecionados.map(k => getLabelCampo(k)).join(', ')}`,
        ativo: false,
      });
      const fluxoId = fluxoRes.data.id;

      // 2. Criar nó de introdução
      const introRes = await api.post(`/bot-builder/fluxos/${fluxoId}/nos`, {
        identificador: 'cadastro_inicio',
        tipo: 'mensagem',
        titulo: 'Início do Cadastro',
        conteudo: `📋 Vamos fazer seu cadastro!\n\nResponda as perguntas abaixo. Leva menos de 1 minuto. 😊`,
        dados_extras: {},
        ordem: 0,
        opcoes: [],
      });
      const noIds: number[] = [introRes.data.id];

      // Manter a ordem: primeiro os campos padrão (ordem de DADOS_COLETAVEIS), depois os custom
      const camposOrdenados = [
        ...Object.keys(DADOS_COLETAVEIS).filter(k => camposSelecionados.includes(k)),
        ...camposSelecionados.filter(k => k.startsWith('custom_')),
      ];

      // 3. Criar nó de coleta para cada campo
      for (let i = 0; i < camposOrdenados.length; i++) {
        const campo = camposOrdenados[i];
        let titulo: string, conteudo: string, validacao: string;

        if (campo.startsWith('custom_')) {
          const slug = campo.replace('custom_', '');
          const cc = camposCustom.find(c => c.slug === slug);
          titulo = cc?.nome || slug;
          conteudo = `Por favor, informe ${cc?.nome || slug}:`;
          const tipoValidacao: Record<string, string> = { numero: 'numero', data: 'data', texto: 'texto', opcoes: 'texto', booleano: 'texto' };
          validacao = tipoValidacao[cc?.tipo || 'texto'] || 'texto';
        } else {
          const cfg = DADOS_COLETAVEIS[campo];
          titulo = cfg.label;
          conteudo = cfg.placeholder;
          validacao = cfg.validacao;
        }

        const noRes = await api.post(`/bot-builder/fluxos/${fluxoId}/nos`, {
          identificador: `coleta_${campo.replace('custom_', 'cx_')}`,
          tipo: 'coletar_dado',
          titulo,
          conteudo,
          dados_extras: {
            variavel: campo,
            validacao,
            pular_se_preenchido: true,
          },
          ordem: i + 1,
          opcoes: [],
        });
        noIds.push(noRes.data.id);
      }

      // 4. Criar nó de conclusão
      const fimRes = await api.post(`/bot-builder/fluxos/${fluxoId}/nos`, {
        identificador: 'cadastro_concluido',
        tipo: 'mensagem',
        titulo: 'Cadastro Concluído',
        conteudo: `✅ Cadastro concluído com sucesso, {{nome_cliente}}!\n\nObrigado por se cadastrar. Em breve entraremos em contato. 🎉`,
        dados_extras: {},
        ordem: camposOrdenados.length + 1,
        opcoes: [],
      });
      noIds.push(fimRes.data.id);

      // 5. Linkar nós em cadeia (cada um aponta para o próximo)
      for (let i = 0; i < noIds.length - 1; i++) {
        await api.patch(`/bot-builder/nos/${noIds[i]}`, {
          proximo_no_id: noIds[i + 1],
        });
      }

      // 6. Ativar se solicitado
      if (ativarAoCriar) {
        await api.post(`/bot-builder/fluxos/${fluxoId}/ativar`, { ativo: true });
      }

      setModalGerador(false);
      carregarFluxos();
      carregarFluxoDetalhado(fluxoId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao gerar fluxo');
    } finally {
      setGerandoFluxo(false);
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
    <div className="flex flex-col transition-all duration-500 overflow-hidden" style={{ background: colors.dashboardBg, height: '100vh' }}>
      {/* Background Orbs */}
      {theme === 'yoursystem' && (
        <>
          <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-20 blur-[120px] pointer-events-none" style={{ background: colors.primary }} />
          <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-10 blur-[100px] pointer-events-none" style={{ background: '#8b5cf6' }} />
        </>
      )}

      {/* Header Premium */}
      <header className="h-24 border-b px-8 flex items-center justify-between sticky top-0 z-50 backdrop-blur-2xl" style={{ background: `${colors.cardBg}88`, borderColor: colors.border }}>
        <div className="flex items-center gap-8">
          <button onClick={() => window.location.href = '/empresa/dashboard'} className="p-4 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-2xl shadow-lg active:scale-90" style={{ color: colors.textPrimary }}>←</button>
          <div className="h-10 w-[1px] opacity-10" style={{ background: colors.textPrimary }} />
          <div>
            <h1 className="text-xl font-black uppercase tracking-[0.25em]" style={{ color: colors.textPrimary }}>Bot <span style={{ color: colors.primary }}>Builder</span></h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mt-0.5" style={{ color: colors.textPrimary }}>Architecting Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30" style={{ color: colors.textPrimary }}>Workspace</span>
            <span className="text-xs font-bold" style={{ color: colors.primary }}>Production Env</span>
          </div>
          <ThemeToggle />
          <button onClick={() => window.location.href = '/empresa/dashboard'} className="px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] border border-blue-500/40 text-blue-500 bg-blue-500/5 hover:bg-blue-500 hover:text-white transition-all shadow-xl active:scale-95">Dashboard</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: Lista de Fluxos Premium */}
        <aside className="w-85 border-r flex flex-col transition-all duration-500 shadow-2xl z-40 backdrop-blur-xl" style={{ background: `${colors.sidebarBg}aa`, borderColor: colors.border }}>
          <div className="p-8 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
            <div className="flex flex-col">
               <h2 className="font-black text-[11px] uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>Meus Fluxos</h2>
               <span className="text-[9px] font-black uppercase opacity-30 tracking-widest mt-0.5" style={{ color: colors.textPrimary }}>Total: {fluxos.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalGerador(true)}
                title="Gerar Fluxo de Cadastro"
                className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-black hover:scale-110 active:scale-90 transition-all shadow-xl shadow-pink-500/20 text-base"
              >✨</button>
              <button
                onClick={() => setModalNovoFluxo(true)}
                className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black hover:scale-110 active:scale-90 transition-all shadow-xl shadow-blue-500/20"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {fluxos.map((fluxo) => (
              <div
                key={fluxo.id}
                onClick={() => carregarFluxoDetalhado(fluxo.id)}
                className={`p-6 rounded-[2rem] border cursor-pointer transition-all duration-500 group relative overflow-hidden ${fluxoSelecionado?.id === fluxo.id ? 'shadow-2xl scale-[1.02]' : 'hover:shadow-xl hover:border-white/20'}`}
                style={{ 
                  background: fluxoSelecionado?.id === fluxo.id ? `${colors.primary}25` : colors.cardBg, 
                  borderColor: fluxoSelecionado?.id === fluxo.id ? colors.primary : colors.border 
                }}
              >
                {fluxoSelecionado?.id === fluxo.id && <div className="absolute left-0 top-0 bottom-0 w-2" style={{ background: colors.primary, boxShadow: `0 0 20px ${colors.primary}` }} />}
                
                <div className="flex justify-between items-start mb-4">
                  <span className="font-black text-[14px] uppercase tracking-tighter line-clamp-1 flex-1 pr-3" style={{ color: fluxoSelecionado?.id === fluxo.id ? colors.primary : colors.textPrimary }}>{fluxo.nome}</span>
                  <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.1em] border shadow-sm ${fluxo.ativo ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                    {fluxo.ativo ? '● Publicado' : 'Pausado'}
                  </span>
                </div>
                <p className="text-[13px] font-medium leading-relaxed mb-5" style={{ color: colors.textPrimary, opacity: 0.8 }}>
                  {fluxo.descricao || 'Fluxo inteligente sem descrição definida.'}
                </p>
                <div className="flex gap-5 pt-5 border-t border-black/5" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); ativarFluxo(fluxo.id, !fluxo.ativo); }}
                    className="text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-70 transition-all active:scale-95"
                    style={{ color: fluxo.ativo ? '#fb7185' : '#34d399' }}
                  >
                    {fluxo.ativo ? 'Interromper' : 'Publicar'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletarFluxo(fluxo.id); }}
                    className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-500 transition-all ml-auto"
                    style={{ color: colors.textPrimary }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
            {fluxos.length === 0 && (
              <div className="text-center py-16 opacity-20 flex flex-col items-center">
                <span className="text-4xl mb-3">📭</span>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>Lista vazia</span>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT: Editor Premium */}
        <main className="flex-1 overflow-y-auto no-scrollbar relative z-10" style={{ background: colors.dashboardBg }}>
          <div className="max-w-7xl mx-auto p-10 lg:p-14">
            {loading ? (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                   <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse" style={{ color: colors.primary }}>Syncing Core...</span>
                </div>
              </div>
            ) : fluxoSelecionado ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Editor Area */}
                <div className="lg:col-span-7 space-y-10 animate-in fade-in slide-in-from-left-4 duration-1000">
                  <section className="rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.15)] border p-10 space-y-8 backdrop-blur-xl" style={{ background: `${colors.cardBg}ee`, borderColor: colors.border }}>
                    <div className="flex justify-between items-center pb-6 border-b border-white/5">
                      <div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>{fluxoSelecionado.nome}</h2>
                        <div className="flex items-center gap-3 mt-1.5">
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Visual Flow Designer</span>
                           <span className="w-1 h-1 rounded-full bg-blue-500 opacity-30" />
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>{fluxoSelecionado.nos.length} Stages</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setModalNovoNo(true)}
                        className="px-10 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] text-white shadow-2xl hover:scale-105 active:scale-95 transition-all"
                        style={{ background: colors.gradientButton }}
                      >
                        + Nova Etapa
                      </button>
                    </div>

                    <div className="space-y-6 pt-4 relative">
                      {/* Central Line Background */}
                      <div className="absolute left-[39px] top-10 bottom-20 w-[2px] opacity-5 pointer-events-none" style={{ background: colors.textPrimary }} />

                      {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map((no, index) => {
                        const config = NODE_TYPE_CONFIG[no.tipo] || NODE_TYPE_CONFIG.mensagem;
                        const isExpanded = expandedNodeId === no.id;

                        return (
                          <div key={no.id} className="relative z-10">
                            <div
                              className={`rounded-[2.2rem] border transition-all duration-700 overflow-hidden ${isExpanded ? 'shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-4 ring-white/5' : 'hover:shadow-xl hover:border-white/10'}`}
                              style={{ 
                                background: isExpanded ? `${config.color}08` : colors.cardBg, 
                                borderColor: isExpanded ? config.color : colors.border 
                              }}
                            >
                              {/* Header Stage */}
                              <div 
                                className="p-6 flex justify-between items-center cursor-pointer group"
                                onClick={() => setExpandedNodeId(isExpanded ? null : (no.id || null))}
                              >
                                <div className="flex items-center gap-6">
                                  <div className="w-14 h-14 rounded-[1.2rem] flex items-center justify-center text-2xl shadow-2xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-3" style={{ background: `${config.color}22`, color: config.color, border: `1px solid ${config.color}33` }}>
                                    {config.icon}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-black text-sm uppercase tracking-tight" style={{ color: colors.textPrimary }}>
                                        {no.titulo || no.identificador}
                                      </span>
                                      <span className="text-[9px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg" style={{ background: `${config.color}15`, color: config.color, border: `1px solid ${config.color}22` }}>
                                        {config.label}
                                      </span>
                                    </div>
                                    {!isExpanded && no.conteudo && (
                                      <p className="text-[11px] opacity-40 font-medium truncate max-w-[400px] mt-1" style={{ color: colors.textPrimary }}>
                                        {no.conteudo}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-6">
                                  {no.opcoes.length > 0 && (
                                    <span className="hidden sm:inline-block text-[10px] font-black uppercase tracking-widest opacity-20" style={{ color: colors.textPrimary }}>
                                      {no.opcoes.length} Path{no.opcoes.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <div className={`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center transition-all duration-700 ${isExpanded ? 'rotate-180 bg-white/10' : ''}`}>
                                     <span className="opacity-30" style={{ color: colors.textPrimary }}>▼</span>
                                  </div>
                                </div>
                              </div>

                              {/* Content Stage */}
                              {isExpanded && (
                                <div className="px-8 pb-8 pt-2 space-y-6 animate-in slide-in-from-top-6 duration-700">
                                  <div className="h-[1px] w-full opacity-5" style={{ background: colors.textPrimary }} />
                                  
                                  <div className="flex flex-col gap-6">
                                    {no.conteudo && (
                                      <div className="p-5 rounded-[1.5rem] bg-black/5 border border-white/5">
                                        <p className="text-[12px] font-medium leading-relaxed whitespace-pre-wrap" style={{ color: colors.textPrimary }}>
                                          {no.conteudo}
                                        </p>
                                      </div>
                                    )}

                                    {/* Extra details (PIX, Webhook, etc) */}
                                    {no.dados_extras && Object.keys(no.dados_extras).length > 0 && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {Object.entries(no.dados_extras).map(([key, val]) => (
                                          key !== 'header_image_url' && (
                                            <div key={key} className="p-4 rounded-2xl bg-black/5 border border-white/5 flex flex-col gap-1">
                                              <span className="text-[9px] font-black uppercase tracking-widest opacity-30" style={{ color: colors.textPrimary }}>{key}</span>
                                              <span className="text-[12px] font-black" style={{ color: config.color }}>{String(val)}</span>
                                            </div>
                                          )
                                        ))}
                                      </div>
                                    )}

                                    {/* Image Preview */}
                                    {no.dados_extras?.header_image_url && (
                                      <div className="rounded-[1.5rem] overflow-hidden border border-white/10 shadow-2xl">
                                        <div className="bg-black/20 p-2 border-b border-white/5 flex items-center justify-between">
                                           <span className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Media Asset</span>
                                           <div className="flex gap-1">
                                              <div className="w-1.5 h-1.5 rounded-full bg-red-500/40" />
                                              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/40" />
                                              <div className="w-1.5 h-1.5 rounded-full bg-green-500/40" />
                                           </div>
                                        </div>
                                        <img src={resolveImageUrl(no.dados_extras.header_image_url)} alt="preview" className="w-full h-48 object-cover transition-transform duration-1000 hover:scale-105" />
                                      </div>
                                    )}

                                    {/* Options / Buttons */}
                                    {no.opcoes.length > 0 && (
                                      <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 flex items-center gap-2">
                                           <div className="w-1 h-1 rounded-full bg-blue-500" />
                                           Paths & Interaction
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {no.opcoes.sort((a, b) => a.ordem - b.ordem).map((opcao, oi) => (
                                            <div key={oi} className="p-4 rounded-[1.2rem] border group/path flex flex-col gap-2 transition-all hover:bg-white/5" style={{ background: `${colors.primary}05`, borderColor: `${colors.primary}15` }}>
                                              <div className="flex justify-between items-center">
                                                <span className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{opcao.titulo}</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest opacity-30 px-2 py-0.5 rounded-lg bg-black/10">{opcao.tipo}</span>
                                              </div>
                                              {opcao.proximo_no_id && (
                                                <div className="flex items-center gap-2 opacity-60">
                                                  <span className="text-blue-500 text-xs font-bold">↳</span>
                                                  <span className="text-[10px] font-black uppercase tracking-tight truncate" style={{ color: colors.primary }}>
                                                    {fluxoSelecionado.nos.find(n => n.id === opcao.proximo_no_id)?.titulo || 'Stage #'+opcao.proximo_no_id}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Quick Actions Stage */}
                                    <div className="flex gap-4 pt-6 border-t border-white/5">
                                      <button onClick={(e) => { e.stopPropagation(); abrirEdicaoNo(no); }} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white border border-blue-500/20 shadow-lg active:scale-95">Editar Etapa</button>
                                      <button onClick={(e) => { e.stopPropagation(); no.id && deletarNo(no.id); }} className="px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all active:scale-95">Remover</button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {fluxoSelecionado.nos.length === 0 && (
                        <div className="text-center py-24 rounded-[3rem] border-4 border-dashed opacity-20 flex flex-col items-center group cursor-pointer hover:opacity-40 transition-opacity" style={{ borderColor: colors.border }} onClick={() => setModalNovoNo(true)}>
                          <span className="text-6xl block mb-6 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6">✨</span>
                          <p className="text-[11px] font-black uppercase tracking-[0.3em]">Canvas Inicial</p>
                          <p className="text-[10px] mt-2 font-medium">Clique para desenhar a primeira interação do bot</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Preview Area Premium */}
                <div className="lg:col-span-5">
                  <div className="sticky top-32 space-y-8 animate-in fade-in slide-in-from-right-4 duration-1000">
                    <BotChatPreview nos={fluxoSelecionado.nos} />
                    
                    <div className="p-8 rounded-[2.5rem] border shadow-[0_20px_40px_rgba(0,0,0,0.1)] space-y-6 backdrop-blur-xl" style={{ background: `${colors.cardBg}aa`, borderColor: colors.border }}>
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40" style={{ color: colors.textPrimary }}>Deployment Status</span>
                        </div>
                        <div className="flex items-center gap-2.5 bg-black/10 px-4 py-2 rounded-full border border-white/5">
                           <span className={`w-2 h-2 rounded-full ${fluxoSelecionado.ativo ? 'bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gray-400'}`} />
                           <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: fluxoSelecionado.ativo ? colors.green : colors.textSecondary }}>{fluxoSelecionado.ativo ? 'Active & Live' : 'Maintenance'}</span>
                        </div>
                      </div>
                      <div className="h-[1px] w-full bg-white/5" />
                      <div className="flex flex-col items-center gap-1 opacity-30">
                         <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center" style={{ color: colors.textPrimary }}>Cloud Auto-Sync Active</p>
                         <p className="text-[8px] font-medium" style={{ color: colors.textPrimary }}>Last synced: {new Date().toLocaleTimeString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[70vh] space-y-10 animate-in zoom-in-95 duration-1000">
                <div className="relative group">
                   <div className="absolute -inset-4 bg-blue-500/20 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                   <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-tr from-white/5 to-white/10 border border-white/10 flex items-center justify-center text-6xl shadow-2xl relative z-10 transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-12">🤖</div>
                </div>
                <div className="text-center space-y-4 max-w-lg">
                  <h2 className="text-4xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Crie seu <span className="text-blue-500">Mestre Digital</span></h2>
                  <p className="text-[12px] font-medium opacity-40 leading-relaxed uppercase tracking-[0.1em]" style={{ color: colors.textPrimary }}>Selecione um projeto na barra lateral ou inicie um novo design de conversação agora mesmo.</p>
                </div>
                <button onClick={() => setModalNovoFluxo(true)} className="px-12 py-5 rounded-2xl font-black text-[12px] uppercase tracking-[0.25em] text-white shadow-[0_20px_40px_rgba(59,130,246,0.3)] hover:scale-105 active:scale-95 transition-all" style={{ background: colors.gradientButton }}>Começar Novo Projeto</button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ==================== MODALS PREMIUM ==================== */}

      {modalNovoFluxo && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] backdrop-blur-xl transition-all" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-[2.5rem] p-10 max-w-lg w-full mx-4 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border animate-in zoom-in-95 duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
            <div className="text-center mb-8">
               <h2 className="text-3xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Novo Fluxo</h2>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-1" style={{ color: colors.textPrimary }}>Inicie um novo projeto de automação</p>
            </div>

            <div className="space-y-6 mb-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Nome do Projeto</label>
                <input
                  type="text"
                  value={nomeFluxo}
                  onChange={(e) => setNomeFluxo(e.target.value)}
                  placeholder="Ex: Suporte VIP"
                  className="w-full px-6 py-4 rounded-2xl outline-none border transition-all focus:ring-4 focus:ring-blue-500/20 font-bold"
                  style={{ ...inputStyle, borderColor: colors.border }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Breve Descrição</label>
                <textarea
                  value={descricaoFluxo}
                  onChange={(e) => setDescricaoFluxo(e.target.value)}
                  placeholder="Qual o objetivo deste robô?"
                  rows={3}
                  className="w-full px-6 py-4 rounded-2xl outline-none border transition-all focus:ring-4 focus:ring-blue-500/20 font-medium resize-none"
                  style={{ ...inputStyle, borderColor: colors.border }}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={criarFluxo}
                disabled={!nomeFluxo}
                className="flex-1 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-30 text-white shadow-xl hover:scale-[1.02] active:scale-95"
                style={{ background: colors.gradientButton }}
              >
                Configurar Fluxo
              </button>
              <button
                onClick={() => { setModalNovoFluxo(false); setNomeFluxo(''); setDescricaoFluxo(''); }}
                className="px-8 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all hover:bg-red-500/10 text-red-500 border border-red-500/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo No Premium */}
      {modalNovoNo && fluxoSelecionado && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] backdrop-blur-xl transition-all overflow-y-auto py-10" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-[3rem] p-10 max-w-3xl w-full mx-4 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border animate-in zoom-in-95 duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
            <div className="text-center mb-10">
               <h2 className="text-3xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Nova Etapa</h2>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-1" style={{ color: colors.textPrimary }}>Adicionando inteligência ao fluxo: {fluxoSelecionado.nome}</p>
            </div>

            <div className="space-y-8 mb-10 max-h-[60vh] overflow-y-auto no-scrollbar pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Identificador Interno</label>
                  <input
                    type="text"
                    value={novoNo.identificador}
                    onChange={(e) => setNovoNo({ ...novoNo, identificador: e.target.value })}
                    placeholder="Ex: inicio_vendas"
                    className="w-full px-6 py-4 rounded-2xl outline-none border font-bold"
                    style={{ ...inputStyle, borderColor: colors.border }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Título de Exibição (Opcional)</label>
                  <input
                    type="text"
                    value={novoNo.titulo}
                    onChange={(e) => setNovoNo({ ...novoNo, titulo: e.target.value })}
                    placeholder="Ex: Saudação Inicial"
                    className="w-full px-6 py-4 rounded-2xl outline-none border font-bold"
                    style={{ ...inputStyle, borderColor: colors.border }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Selecione o Tipo de Interação</label>
                <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {Object.entries(NODE_TYPE_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setNovoNo({ ...novoNo, tipo: key, opcoes: [], dados_extras: {} })}
                      className="p-4 rounded-[1.5rem] text-center transition-all group border-2 relative overflow-hidden"
                      style={{
                        background: novoNo.tipo === key ? `${config.color}15` : 'transparent',
                        borderColor: novoNo.tipo === key ? config.color : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <span className="text-2xl block mb-2 transition-transform group-hover:scale-125 duration-500">{config.icon}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest block" style={{ color: novoNo.tipo === key ? config.color : colors.textSecondary }}>
                        {config.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {!['delay', 'webhook_externo', 'gerar_pagamento'].includes(novoNo.tipo) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>
                    {novoNo.tipo === 'condicional' ? 'Lógica da Condição' : novoNo.tipo === 'coletar_dado' ? 'Mensagem de Solicitação' : 'Mensagem do Bot'}
                  </label>
                  <textarea
                    value={novoNo.conteudo}
                    onChange={(e) => setNovoNo({ ...novoNo, conteudo: e.target.value })}
                    placeholder={
                      novoNo.tipo === 'condicional' ? 'Ex: dados.cpf != null' :
                      novoNo.tipo === 'coletar_dado' ? 'Ex: Por favor, informe seu nome completo:' :
                      'O que o robô deve dizer nesta etapa?'
                    }
                    rows={4}
                    className="w-full px-6 py-4 rounded-[1.8rem] outline-none border font-medium resize-none"
                    style={{ ...inputStyle, borderColor: colors.border }}
                  />
                </div>
              )}

              {/* Upload Section Premium */}
              {['botoes', 'mensagem'].includes(novoNo.tipo) && (
                <div className="space-y-3 p-6 rounded-[2rem] border border-dashed border-white/10 bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Mídia do Cabeçalho (WhatsApp)</label>
                    {novoNo.dados_extras?.header_image_url && (
                      <button onClick={() => updateDadosExtras('header_image_url', '')} className="text-[9px] font-black uppercase text-red-500 hover:opacity-70">Descartar</button>
                    )}
                  </div>
                  {!novoNo.dados_extras?.header_image_url ? (
                    <label className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest opacity-40">Upload JPG, PNG ou WEBP (Max 5MB)</span>
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                           const file = e.target.files?.[0];
                           if (!file) return;
                           const formData = new FormData();
                           formData.append('file', file);
                           try {
                             const res = await api.post('/bot-builder/upload-imagem', formData);
                             updateDadosExtras('header_image_url', res.data.url);
                           } catch (err) { alert('Falha no upload'); }
                        }} />
                    </label>
                  ) : (
                    <div className="rounded-xl overflow-hidden h-32 border border-white/10 relative group">
                       <img src={resolveImageUrl(novoNo.dados_extras.header_image_url)} alt="preview" className="w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="text-white text-[10px] font-black uppercase tracking-widest">Imagem Carregada</span>
                       </div>
                    </div>
                  )}
                </div>
              )}

              {/* Coletar Dado */}
              {novoNo.tipo === 'coletar_dado' && (
                <div className="p-6 rounded-[2rem] border-2 border-pink-500/20 bg-pink-500/5 space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1 block" style={{ color: colors.textPrimary }}>
                    Qual dado você quer capturar?
                  </label>
                  {/* Card grid - muito mais intuitivo que dropdown */}
                  <div className="space-y-3">
                    {(() => {
                      const grupos: Record<string, string[]> = {};
                      Object.entries(DADOS_COLETAVEIS).forEach(([key, cfg]) => {
                        if (!grupos[cfg.grupo]) grupos[cfg.grupo] = [];
                        grupos[cfg.grupo].push(key);
                      });
                      const elementos = Object.entries(grupos).map(([grupo, keys]) => (
                        <div key={grupo}>
                          <div className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1.5 ml-1" style={{ color: colors.textPrimary }}>{grupo}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {keys.map(key => {
                              const cfg = DADOS_COLETAVEIS[key];
                              const sel = novoNo.dados_extras?.variavel === key;
                              return (
                                <button key={key} type="button" onClick={() => setNovoNo({ ...novoNo, conteudo: cfg.placeholder, dados_extras: { ...novoNo.dados_extras, variavel: key, validacao: cfg.validacao } })} className="flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]" style={{ background: sel ? '#EC489915' : 'transparent', borderColor: sel ? '#EC4899' : colors.border }}>
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-sm">{cfg.emoji}</span>
                                    <span className="text-[11px] font-black leading-tight" style={{ color: sel ? '#EC4899' : colors.textPrimary }}>{cfg.label}</span>
                                  </div>
                                  <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50" style={{ color: colors.textPrimary }}>{cfg.validacaoDesc}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ));
                      if (camposCustom.length > 0) {
                        elementos.push(
                          <div key="Personalizado">
                            <div className="text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1" style={{ color: '#8B5CF6' }}>⚙️ Personalizados da Empresa</div>
                            <div className="grid grid-cols-2 gap-2">
                              {camposCustom.map(cc => {
                                const key = `custom_${cc.slug}`;
                                const sel = novoNo.dados_extras?.variavel === key;
                                const tipoValidacao: Record<string, string> = { numero: 'numero', data: 'data', texto: 'texto', opcoes: 'texto', booleano: 'texto' };
                                return (
                                  <button key={key} type="button" onClick={() => setNovoNo({ ...novoNo, conteudo: `Por favor, informe ${cc.nome}:`, dados_extras: { ...novoNo.dados_extras, variavel: key, validacao: tipoValidacao[cc.tipo] || 'texto' } })} className="flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]" style={{ background: sel ? '#8B5CF615' : 'transparent', borderColor: sel ? '#8B5CF6' : colors.border }}>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-sm">⚙️</span>
                                      <span className="text-[11px] font-black leading-tight" style={{ color: sel ? '#8B5CF6' : colors.textPrimary }}>{cc.nome}</span>
                                    </div>
                                    <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50" style={{ color: colors.textPrimary }}>{cc.tipo}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return elementos;
                    })()}
                  </div>
                  {novoNo.dados_extras?.variavel && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: novoNo.dados_extras.variavel.startsWith('custom_') ? '#8B5CF610' : '#EC489910' }}>
                      <span className="text-xs font-black" style={{ color: novoNo.dados_extras.variavel.startsWith('custom_') ? '#8B5CF6' : '#EC4899' }}>✓</span>
                      <span className="text-[11px] font-semibold" style={{ color: novoNo.dados_extras.variavel.startsWith('custom_') ? '#8B5CF6' : '#EC4899' }}>
                        {novoNo.dados_extras.variavel.startsWith('custom_') ? `Campo personalizado: ${getLabelCampo(novoNo.dados_extras.variavel)}` : `Validação automática: ${DADOS_COLETAVEIS[novoNo.dados_extras.variavel]?.validacaoDesc}`}
                      </span>
                    </div>
                  )}
                  <label className="flex items-center gap-3 cursor-pointer p-2">
                    <input type="checkbox" checked={novoNo.dados_extras?.pular_se_preenchido || false} onChange={(e) => updateDadosExtras('pular_se_preenchido', e.target.checked)} className="w-5 h-5 rounded-lg" style={{ accentColor: '#EC4899' }} />
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-60" style={{ color: colors.textPrimary }}>Pular se o cliente já tiver este dado</span>
                  </label>
                </div>
              )}

              {/* Condicional */}
              {novoNo.tipo === 'condicional' && (
                <div className="space-y-4 p-6 rounded-[2rem] border-2 border-indigo-500/20 bg-indigo-500/5">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Formatos Suportados (Clique para usar)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { code: 'cliente_has:cpf', desc: 'Cliente tem CPF?' },
                      { code: 'cliente_has:email', desc: 'Cliente tem email?' },
                      { code: 'cliente_has:nome_completo', desc: 'Cliente tem nome?' },
                      { code: 'variavel == valor', desc: 'Comparação direta' },
                    ].map(item => (
                      <button key={item.code} onClick={() => setNovoNo({ ...novoNo, conteudo: item.code })} className="flex flex-col items-start p-3 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all">
                        <code className="text-xs font-bold text-indigo-400">{item.code}</code>
                        <span className="text-[9px] font-black uppercase opacity-40">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delay */}
              {novoNo.tipo === 'delay' && (
                <div className="flex gap-4 p-6 rounded-[2rem] border-2 border-teal-500/20 bg-teal-500/5">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Duração</label>
                    <input type="number" value={novoNo.dados_extras?.duracao || ''} onChange={(e) => updateDadosExtras('duracao', Number(e.target.value))} placeholder="5" className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Unidade</label>
                    <select value={novoNo.dados_extras?.unidade || 'segundos'} onChange={(e) => updateDadosExtras('unidade', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                      <option value="segundos">Segundos</option>
                      <option value="minutos">Minutos</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Webhook */}
              {novoNo.tipo === 'webhook_externo' && (
                <div className="space-y-4 p-6 rounded-[2rem] border-2 border-orange-500/20 bg-orange-500/5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>URL do Endpoint</label>
                    <input type="text" value={novoNo.dados_extras?.url || ''} onChange={(e) => updateDadosExtras('url', e.target.value)} placeholder="https://api.exemplo.com/hook" className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Método HTTP</label>
                    <select value={novoNo.dados_extras?.method || 'POST'} onChange={(e) => updateDadosExtras('method', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Pagamento */}
              {novoNo.tipo === 'gerar_pagamento' && (
                <div className="space-y-4 p-6 rounded-[2rem] border-2 border-green-500/20 bg-green-500/5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Valor do PIX (R$)</label>
                    <input type="number" step="0.01" value={novoNo.dados_extras?.valor || ''} onChange={(e) => updateDadosExtras('valor', e.target.value)} placeholder="29.90" className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Descrição da Fatura</label>
                    <input type="text" value={novoNo.dados_extras?.descricao || ''} onChange={(e) => updateDadosExtras('descricao', e.target.value)} placeholder="Ex: Assinatura Premium" className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                </div>
              )}

              {/* Sequência Automática */}
              {['mensagem', 'coletar_dado', 'delay', 'webhook_externo', 'gerar_pagamento', 'transferir_atendente'].includes(novoNo.tipo) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Sequência Automática (Pular para)</label>
                  <select
                    value={novoNo.proximo_no_id || ''}
                    onChange={(e) => setNovoNo({ ...novoNo, proximo_no_id: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-6 py-4 rounded-2xl outline-none border font-bold shadow-sm focus:ring-4 focus:ring-blue-500/10 transition-all"
                    style={{ ...inputStyle, borderColor: colors.border }}
                  >
                    <option value="">Fim do Fluxo</option>
                    {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map(n => (
                      <option key={n.id} value={n.id}>{NODE_TYPE_CONFIG[n.tipo]?.icon} {n.titulo || n.identificador}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Options Section Premium */}
              {['lista', 'botoes', 'condicional'].includes(novoNo.tipo) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Caminhos de Interação</label>
                    <button onClick={adicionarOpcao} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all shadow-lg active:scale-95">+ Add Option</button>
                  </div>
                  <div className="space-y-3">
                    {novoNo.opcoes.map((opcao, index) => (
                      <div key={index} className="p-6 rounded-[2rem] border border-white/5 bg-white/5 space-y-4 shadow-xl animate-in slide-in-from-top-4 duration-500">
                         <div className="flex gap-4">
                            <input type="text" value={opcao.titulo} onChange={(e) => atualizarOpcao(index, 'titulo', e.target.value)} placeholder={novoNo.tipo === 'condicional' ? (index === 0 ? 'Verdadeiro' : 'Falso') : "Texto do Botão / Item"} className="flex-1 px-5 py-3 rounded-xl outline-none border text-[12px] font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                            <button onClick={() => removerOpcao(index)} className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-md">✕</button>
                         </div>
                         {novoNo.tipo === 'lista' && (
                           <input type="text" value={opcao.descricao || ''} onChange={(e) => atualizarOpcao(index, 'descricao', e.target.value)} placeholder="Descrição secundária (Opcional)" className="w-full px-5 py-3 rounded-xl outline-none border text-[11px] font-medium" style={{ ...inputStyle, borderColor: colors.border }} />
                         )}
                         <select value={opcao.proximo_no_id || ''} onChange={(e) => atualizarOpcao(index, 'proximo_no_id', e.target.value)} className="w-full px-5 py-3 rounded-xl outline-none border text-[11px] font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                            <option value="">Encerrar aqui</option>
                            {fluxoSelecionado.nos.sort((a, b) => a.ordem - b.ordem).map(n => <option key={n.id} value={n.id}>{NODE_TYPE_CONFIG[n.tipo]?.icon} {n.titulo || n.identificador}</option>)}
                         </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 border-t border-white/5">
              <button
                onClick={criarNo}
                disabled={!novoNo.identificador}
                className="flex-1 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-30 text-white shadow-[0_20px_40px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-95"
                style={{ background: colors.gradientButton }}
              >
                Gerar Etapa
              </button>
              <button
                onClick={() => { setModalNovoNo(false); setNovoNo({ identificador: '', tipo: 'mensagem', titulo: '', conteudo: '', dados_extras: {}, ordem: 0, opcoes: [] }); }}
                className="px-10 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all hover:bg-red-500/10 text-red-500 border border-red-500/20"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar No Premium */}
      {modalEditarNo && noEditando && fluxoSelecionado && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] backdrop-blur-xl transition-all overflow-y-auto py-10" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-[3rem] p-10 max-w-3xl w-full mx-4 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border animate-in zoom-in-95 duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
            <div className="text-center mb-10">
               <h2 className="text-3xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Refinar Etapa</h2>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-1" style={{ color: colors.textPrimary }}>Ajustando a inteligência: {noEditando.titulo || noEditando.identificador}</p>
            </div>

            <div className="space-y-8 mb-10 max-h-[60vh] overflow-y-auto no-scrollbar pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Identificador</label>
                  <input type="text" value={noEditando.identificador} onChange={(e) => setNoEditando({ ...noEditando, identificador: e.target.value })} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Título de Exibição</label>
                  <input type="text" value={noEditando.titulo || ''} onChange={(e) => setNoEditando({ ...noEditando, titulo: e.target.value })} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Tipo Selecionado:</span>
                 <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ background: `${(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).color}15`, color: (NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).color, border: `1px solid ${(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).color}22` }}>
                    {(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).icon} {(NODE_TYPE_CONFIG[noEditando.tipo] || NODE_TYPE_CONFIG.mensagem).label}
                 </div>
              </div>

              {!['delay', 'webhook_externo', 'gerar_pagamento'].includes(noEditando.tipo) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>{noEditando.tipo === 'coletar_dado' ? 'Solicitação de Dado' : 'Conteúdo da Mensagem'}</label>
                  <textarea value={noEditando.conteudo || ''} onChange={(e) => setNoEditando({ ...noEditando, conteudo: e.target.value })} rows={4} className="w-full px-6 py-4 rounded-[1.8rem] outline-none border font-medium resize-none" style={{ ...inputStyle, borderColor: colors.border }} />
                </div>
              )}

              {/* Edit Media Section */}
              {['botoes', 'mensagem'].includes(noEditando.tipo) && (
                <div className="space-y-3 p-6 rounded-[2rem] border border-dashed border-white/10 bg-white/5">
                  <div className="flex items-center justify-between">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Mídia do Cabeçalho</label>
                     {noEditando.dados_extras?.header_image_url && (
                        <button onClick={() => updateEditDadosExtras('header_image_url', '')} className="text-[9px] font-black uppercase text-red-500 hover:opacity-70">Descartar</button>
                     )}
                  </div>
                  {!noEditando.dados_extras?.header_image_url ? (
                    <label className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                       <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                       </div>
                       <span className="text-[11px] font-black uppercase tracking-widest opacity-40">Atualizar Ativo de Mídia</span>
                       <input type="file" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await api.post('/bot-builder/upload-imagem', formData);
                            updateEditDadosExtras('header_image_url', res.data.url);
                          } catch (err) { alert('Falha'); }
                       }} />
                    </label>
                  ) : (
                    <div className="rounded-xl overflow-hidden h-32 border border-white/10 shadow-2xl">
                       <img src={resolveImageUrl(noEditando.dados_extras.header_image_url)} alt="preview" className="w-full h-full object-cover transition-transform duration-1000 hover:scale-105" />
                    </div>
                  )}
                </div>
              )}

              {/* Specialized Logic Fields - Coletar Dado */}
              {noEditando.tipo === 'coletar_dado' && (
                <div className="p-6 rounded-[2rem] border-2 border-pink-500/20 bg-pink-500/5 space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1 block" style={{ color: colors.textPrimary }}>
                    Qual dado você quer capturar?
                  </label>
                  <div className="space-y-3">
                    {(() => {
                      const grupos: Record<string, string[]> = {};
                      Object.entries(DADOS_COLETAVEIS).forEach(([key, cfg]) => {
                        if (!grupos[cfg.grupo]) grupos[cfg.grupo] = [];
                        grupos[cfg.grupo].push(key);
                      });
                      const elementos = Object.entries(grupos).map(([grupo, keys]) => (
                        <div key={grupo}>
                          <div className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1.5 ml-1" style={{ color: colors.textPrimary }}>{grupo}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {keys.map(key => {
                              const cfg = DADOS_COLETAVEIS[key];
                              const sel = noEditando.dados_extras?.variavel === key;
                              return (
                                <button key={key} type="button" onClick={() => setNoEditando({ ...noEditando, conteudo: cfg.placeholder, dados_extras: { ...noEditando.dados_extras, variavel: key, validacao: cfg.validacao } })} className="flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]" style={{ background: sel ? '#EC489915' : 'transparent', borderColor: sel ? '#EC4899' : colors.border }}>
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-sm">{cfg.emoji}</span>
                                    <span className="text-[11px] font-black leading-tight" style={{ color: sel ? '#EC4899' : colors.textPrimary }}>{cfg.label}</span>
                                  </div>
                                  <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50" style={{ color: colors.textPrimary }}>{cfg.validacaoDesc}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ));
                      if (camposCustom.length > 0) {
                        elementos.push(
                          <div key="Personalizado">
                            <div className="text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1" style={{ color: '#8B5CF6' }}>⚙️ Personalizados da Empresa</div>
                            <div className="grid grid-cols-2 gap-2">
                              {camposCustom.map(cc => {
                                const key = `custom_${cc.slug}`;
                                const sel = noEditando.dados_extras?.variavel === key;
                                const tipoValidacao: Record<string, string> = { numero: 'numero', data: 'data', texto: 'texto', opcoes: 'texto', booleano: 'texto' };
                                return (
                                  <button key={key} type="button" onClick={() => setNoEditando({ ...noEditando, conteudo: `Por favor, informe ${cc.nome}:`, dados_extras: { ...noEditando.dados_extras, variavel: key, validacao: tipoValidacao[cc.tipo] || 'texto' } })} className="flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]" style={{ background: sel ? '#8B5CF615' : 'transparent', borderColor: sel ? '#8B5CF6' : colors.border }}>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-sm">⚙️</span>
                                      <span className="text-[11px] font-black leading-tight" style={{ color: sel ? '#8B5CF6' : colors.textPrimary }}>{cc.nome}</span>
                                    </div>
                                    <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50" style={{ color: colors.textPrimary }}>{cc.tipo}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return elementos;
                    })()}
                  </div>
                  {noEditando.dados_extras?.variavel && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: noEditando.dados_extras.variavel.startsWith('custom_') ? '#8B5CF610' : '#EC489910' }}>
                      <span className="text-xs font-black" style={{ color: noEditando.dados_extras.variavel.startsWith('custom_') ? '#8B5CF6' : '#EC4899' }}>✓</span>
                      <span className="text-[11px] font-semibold" style={{ color: noEditando.dados_extras.variavel.startsWith('custom_') ? '#8B5CF6' : '#EC4899' }}>
                        {noEditando.dados_extras.variavel.startsWith('custom_') ? `Campo personalizado: ${getLabelCampo(noEditando.dados_extras.variavel)}` : `Validação automática: ${DADOS_COLETAVEIS[noEditando.dados_extras.variavel]?.validacaoDesc}`}
                      </span>
                    </div>
                  )}
                  <label className="flex items-center gap-3 cursor-pointer p-2">
                    <input type="checkbox" checked={noEditando.dados_extras?.pular_se_preenchido || false} onChange={(e) => updateEditDadosExtras('pular_se_preenchido', e.target.checked)} className="w-5 h-5 rounded-lg" style={{ accentColor: '#EC4899' }} />
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-60" style={{ color: colors.textPrimary }}>Pular se já preenchido</span>
                  </label>
                </div>
              )}

              {noEditando.tipo === 'delay' && (
                <div className="flex gap-4 p-6 rounded-[2rem] border-2 border-teal-500/20 bg-teal-500/5">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Duração</label>
                    <input type="number" value={noEditando.dados_extras?.duracao || ''} onChange={(e) => updateEditDadosExtras('duracao', Number(e.target.value))} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Unidade</label>
                    <select value={noEditando.dados_extras?.unidade || 'segundos'} onChange={(e) => updateEditDadosExtras('unidade', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                      <option value="segundos">Segundos</option>
                      <option value="minutos">Minutos</option>
                    </select>
                  </div>
                </div>
              )}

              {noEditando.tipo === 'webhook_externo' && (
                <div className="space-y-4 p-6 rounded-[2rem] border-2 border-orange-500/20 bg-orange-500/5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Endpoint URL</label>
                    <input type="text" value={noEditando.dados_extras?.url || ''} onChange={(e) => updateEditDadosExtras('url', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Método</label>
                    <select value={noEditando.dados_extras?.method || 'POST'} onChange={(e) => updateEditDadosExtras('method', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                </div>
              )}

              {noEditando.tipo === 'gerar_pagamento' && (
                <div className="space-y-4 p-6 rounded-[2rem] border-2 border-green-500/20 bg-green-500/5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Valor PIX (R$)</label>
                    <input type="number" step="0.01" value={noEditando.dados_extras?.valor || ''} onChange={(e) => updateEditDadosExtras('valor', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Descrição</label>
                    <input type="text" value={noEditando.dados_extras?.descricao || ''} onChange={(e) => updateEditDadosExtras('descricao', e.target.value)} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                  </div>
                </div>
              )}

              {['mensagem', 'coletar_dado', 'delay', 'webhook_externo', 'gerar_pagamento', 'transferir_atendente'].includes(noEditando.tipo) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Sequência Automática</label>
                  <select value={noEditando.proximo_no_id || ''} onChange={(e) => setNoEditando({ ...noEditando, proximo_no_id: e.target.value ? Number(e.target.value) : undefined })} className="w-full px-6 py-4 rounded-2xl outline-none border font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                    <option value="">Fim do Fluxo</option>
                    {fluxoSelecionado.nos.filter(n => n.id !== noEditando.id).sort((a, b) => a.ordem - b.ordem).map(n => <option key={n.id} value={n.id}>{NODE_TYPE_CONFIG[n.tipo]?.icon} {n.titulo || n.identificador}</option>)}
                  </select>
                </div>
              )}

              {['lista', 'botoes', 'condicional'].includes(noEditando.tipo) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1" style={{ color: colors.textPrimary }}>Caminhos de Interação</label>
                    <button onClick={adicionarOpcaoEdit} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase shadow-lg active:scale-95">+ Add Option</button>
                  </div>
                  <div className="space-y-3">
                    {noEditando.opcoes.map((opcao, index) => (
                      <div key={opcao.id || `edit-${index}`} className="p-6 rounded-[2rem] border border-white/5 bg-white/5 space-y-4 shadow-xl animate-in slide-in-from-top-4 duration-500">
                         <div className="flex gap-4">
                            <input type="text" value={opcao.titulo} onChange={(e) => atualizarOpcaoEdit(index, 'titulo', e.target.value)} placeholder="Texto" className="flex-1 px-5 py-3 rounded-xl outline-none border text-[12px] font-bold" style={{ ...inputStyle, borderColor: colors.border }} />
                            <button onClick={() => removerOpcaoEdit(index)} className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-md">✕</button>
                         </div>
                         {noEditando.tipo === 'lista' && (
                           <input type="text" value={opcao.descricao || ''} onChange={(e) => atualizarOpcaoEdit(index, 'descricao', e.target.value)} placeholder="Descrição (Opcional)" className="w-full px-5 py-3 rounded-xl outline-none border text-[11px] font-medium" style={{ ...inputStyle, borderColor: colors.border }} />
                         )}
                         <select value={opcao.proximo_no_id || ''} onChange={(e) => atualizarOpcaoEdit(index, 'proximo_no_id', e.target.value)} className="w-full px-5 py-3 rounded-xl outline-none border text-[11px] font-bold" style={{ ...inputStyle, borderColor: colors.border }}>
                            <option value="">Encerrar</option>
                            {fluxoSelecionado.nos.filter(n => n.id !== noEditando.id).sort((a, b) => a.ordem - b.ordem).map(n => <option key={n.id} value={n.id}>{NODE_TYPE_CONFIG[n.tipo]?.icon} {n.titulo || n.identificador}</option>)}
                         </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 border-t border-white/5">
              <button onClick={salvarEdicaoNo} className="flex-1 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all text-white shadow-[0_20px_40px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-95" style={{ background: colors.gradientButton }}>Finalizar Edição</button>
              <button onClick={() => { setModalEditarNo(false); setNoEditando(null); }} className="px-10 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all hover:bg-red-500/10 text-red-500 border border-red-500/20">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL GERADOR DE CADASTRO ==================== */}
      {modalGerador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-2xl rounded-[2.5rem] border shadow-[0_40px_100px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh]" style={{ background: colors.cardBg, borderColor: colors.border }}>
            {/* Header */}
            <div className="p-8 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: colors.border }}>
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">✨</span>
                  <h2 className="text-xl font-black uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>Gerador de <span style={{ color: '#EC4899' }}>Cadastro</span></h2>
                </div>
                <p className="text-[11px] font-bold opacity-40 mt-1 ml-12 uppercase tracking-widest" style={{ color: colors.textPrimary }}>Selecione os campos e gere o fluxo automaticamente</p>
              </div>
              <button onClick={() => setModalGerador(false)} className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg hover:bg-red-500/10 text-red-400 transition-all border border-red-500/10">✕</button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">

              {/* Nome do fluxo */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Nome do Fluxo</label>
                <input
                  type="text"
                  value={nomeFluxoGerador}
                  onChange={e => setNomeFluxoGerador(e.target.value)}
                  placeholder="Ex: Cadastro de Clientes"
                  className="w-full px-6 py-4 rounded-2xl outline-none border font-bold"
                  style={{ ...{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary } }}
                />
              </div>

              {/* Seleção de campos por grupo */}
              <div className="space-y-5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>
                  Campos a coletar — {camposSelecionados.length} selecionado{camposSelecionados.length !== 1 ? 's' : ''}
                </label>

                {(['Pessoal', 'Endereço', 'Financeiro', 'Profissional'] as const).map(grupo => {
                  const camposGrupo = Object.entries(DADOS_COLETAVEIS).filter(([, cfg]) => cfg.grupo === grupo);
                  const todosSel = camposGrupo.every(([key]) => camposSelecionados.includes(key));
                  const grupoEmoji: Record<string, string> = { Pessoal: '👤', 'Endereço': '🏠', Financeiro: '💰', Profissional: '💼' };
                  return (
                    <div key={grupo} className="rounded-[1.5rem] border overflow-hidden" style={{ borderColor: colors.border }}>
                      <button onClick={() => selecionarGrupo(grupo)} className="w-full px-6 py-4 flex items-center justify-between transition-all hover:opacity-80" style={{ background: colors.inputBg }}>
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{grupoEmoji[grupo]}</span>
                          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>{grupo}</span>
                          <span className="text-[10px] font-bold opacity-40" style={{ color: colors.textPrimary }}>({camposGrupo.filter(([k]) => camposSelecionados.includes(k)).length}/{camposGrupo.length})</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: todosSel ? '#EC4899' : colors.textSecondary }}>{todosSel ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                      </button>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        {camposGrupo.map(([key, cfg]) => {
                          const sel = camposSelecionados.includes(key);
                          return (
                            <button key={key} onClick={() => toggleCampo(key)} className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left" style={{ background: sel ? '#EC489915' : colors.dashboardBg, borderColor: sel ? '#EC4899' : colors.border }}>
                              <div className="w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all" style={{ borderColor: sel ? '#EC4899' : colors.border, background: sel ? '#EC4899' : 'transparent' }}>
                                {sel && <span className="text-white text-[10px] font-black">✓</span>}
                              </div>
                              <div>
                                <div className="text-[11px] font-black" style={{ color: colors.textPrimary }}>{cfg.emoji} {cfg.label}</div>
                                <div className="text-[9px] font-bold opacity-40 mt-0.5" style={{ color: colors.textPrimary }}>{cfg.validacaoDesc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Grupo: Campos Personalizados da empresa */}
                {camposCustom.length > 0 && (() => {
                  const chavesCustom = camposCustom.map(c => `custom_${c.slug}`);
                  const todosSel = chavesCustom.every(k => camposSelecionados.includes(k));
                  return (
                    <div className="rounded-[1.5rem] border overflow-hidden" style={{ borderColor: '#8B5CF640', background: '#8B5CF605' }}>
                      <button onClick={() => selecionarGrupo('Personalizado')} className="w-full px-6 py-4 flex items-center justify-between transition-all hover:opacity-80" style={{ background: '#8B5CF610' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-lg">⚙️</span>
                          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8B5CF6' }}>Personalizados</span>
                          <span className="text-[10px] font-bold opacity-40" style={{ color: colors.textPrimary }}>({chavesCustom.filter(k => camposSelecionados.includes(k)).length}/{camposCustom.length})</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: todosSel ? '#8B5CF6' : colors.textSecondary }}>{todosSel ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                      </button>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        {camposCustom.map(cc => {
                          const key = `custom_${cc.slug}`;
                          const sel = camposSelecionados.includes(key);
                          const tipoLabel: Record<string, string> = { texto: 'Texto livre', numero: 'Número', data: 'Data', opcoes: 'Opções', booleano: 'Sim/Não' };
                          return (
                            <button key={key} onClick={() => toggleCampo(key)} className="flex items-center gap-3 p-4 rounded-2xl border transition-all text-left" style={{ background: sel ? '#8B5CF615' : colors.dashboardBg, borderColor: sel ? '#8B5CF6' : colors.border }}>
                              <div className="w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all" style={{ borderColor: sel ? '#8B5CF6' : colors.border, background: sel ? '#8B5CF6' : 'transparent' }}>
                                {sel && <span className="text-white text-[10px] font-black">✓</span>}
                              </div>
                              <div>
                                <div className="text-[11px] font-black" style={{ color: colors.textPrimary }}>⚙️ {cc.nome}</div>
                                <div className="text-[9px] font-bold opacity-40 mt-0.5" style={{ color: colors.textPrimary }}>{tipoLabel[cc.tipo] || 'Texto'}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Preview do fluxo */}
              {camposSelecionados.length > 0 && (
                <div className="rounded-[1.5rem] border p-5 space-y-2" style={{ borderColor: '#EC489930', background: '#EC489908' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#EC4899' }}>Preview do fluxo gerado</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-black flex-shrink-0">1</span>
                      <span>💬 "Vamos fazer seu cadastro!"</span>
                    </div>
                    {[
                      ...Object.keys(DADOS_COLETAVEIS).filter(k => camposSelecionados.includes(k)),
                      ...camposSelecionados.filter(k => k.startsWith('custom_')),
                    ].map((campo, i) => (
                      <div key={campo} className="flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                        <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 2}</span>
                        <span>📝 {campo.startsWith('custom_') ? '⚙️' : DADOS_COLETAVEIS[campo]?.emoji} {getLabelCampo(campo)} <span className="opacity-40">(pula se já preenchido)</span></span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary }}>
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-[9px] font-black flex-shrink-0">{camposSelecionados.length + 2}</span>
                      <span>✅ "Cadastro concluído!"</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Ativar ao criar */}
              <div className="flex items-center justify-between p-5 rounded-2xl border" style={{ borderColor: colors.border, background: colors.inputBg }}>
                <div>
                  <p className="text-[11px] font-black" style={{ color: colors.textPrimary }}>Ativar fluxo ao criar</p>
                  <p className="text-[10px] opacity-40 font-bold mt-0.5" style={{ color: colors.textPrimary }}>O fluxo será ativado imediatamente e desativará o anterior</p>
                </div>
                <button
                  onClick={() => setAtivarAoCriar(!ativarAoCriar)}
                  className="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                  style={{ background: ativarAoCriar ? '#EC4899' : colors.border }}
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-lg absolute top-0.5 transition-all" style={{ left: ativarAoCriar ? '26px' : '2px' }} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t flex gap-4 flex-shrink-0" style={{ borderColor: colors.border }}>
              <button
                onClick={gerarFluxoCadastro}
                disabled={gerandoFluxo || camposSelecionados.length === 0}
                className="flex-1 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all text-white disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_rgba(236,72,153,0.4)]"
                style={{ background: 'linear-gradient(135deg, #EC4899, #8B5CF6)' }}
              >
                {gerandoFluxo ? '⏳ Gerando...' : `✨ Gerar Fluxo (${camposSelecionados.length} campo${camposSelecionados.length !== 1 ? 's' : ''})`}
              </button>
              <button
                onClick={() => setModalGerador(false)}
                className="px-10 py-5 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest transition-all hover:bg-red-500/10 text-red-500 border border-red-500/20"
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
