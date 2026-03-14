import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../hooks/useToast';
import { Toast } from '../Toast/Toast';
import { TypingIndicator } from '../TypingIndicator/TypingIndicator';
import TransferirModal from '../Modals/TransferirModal';
import EncerrarModal from '../Modals/EncerrarModal';
import api, { chatApi, mediaApi } from '../../services/api';
import Header from '../Header/Header';
import MessageBubble from '../MessageBubble/MessageBubble';
import InputBox from '../InputBox/InputBox';
import DateSeparator from '../DateSeparator/DateSeparator';
import { isSameDay } from 'date-fns';
import { playNotificationSound } from '../../utils/notification';
import whatsappBg from '../../images/PLANO-DE-FUNDO-WHATS-APP.png';
import './Chat.css';

interface ChatProps {
  onVoltar?: () => void;
}

const Chat: React.FC<ChatProps> = ({ onVoltar }) => {
  const { user, token } = useAuth();
  const { theme, colors } = useTheme();
  const { toasts, showToast, removeToast } = useToast();
  const [usuarioDigitando, setUsuarioDigitando] = useState<{ nome: string; timeout: NodeJS.Timeout } | null>(null);
  const [modalTransferirAberto, setModalTransferirAberto] = useState(false);
  const [modalEncerrarAberto, setModalEncerrarAberto] = useState(false);
  // Reply contextual (responder mensagem específica)
  const [replyTo, setReplyTo] = useState<{ message_id: string; conteudo: string; direcao: 'enviada' | 'recebida' } | null>(null);

  // Usar ref para conversaSelecionada evitar stale closure
  const conversaSelecionadaRef = useRef<string | null>(null);

  const {
    conversaSelecionada,
    conversas,
    detalhesConversa,
    loadingDetalhes,
    enviandoMensagem,
    setDetalhesConversa,
    atualizarAtendimentoDetalhes,
    setLoadingDetalhes,
    setEnviandoMensagem,
    setConversas,
    adicionarMensagem,
    atualizarConversaPreview,
    atualizarConversa,
    removerConversa,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Capturar teclas em qualquer lugar do chat e redirecionar para o input
  const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ignorar se já está no textarea ou se é atalho/modificador
    if (
      e.target === inputRef.current ||
      e.ctrlKey || e.metaKey || e.altKey ||
      e.key === 'Tab' || e.key === 'Escape' ||
      e.key === 'F1' || e.key === 'F2' || e.key === 'F3' || e.key === 'F4' ||
      e.key === 'F5' || e.key === 'F6' || e.key === 'F7' || e.key === 'F8' ||
      e.key === 'F9' || e.key === 'F10' || e.key === 'F11' || e.key === 'F12'
    ) {
      return;
    }

    // Para teclas de texto, focar no input (o caractere será digitado lá)
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
      inputRef.current?.focus();
    }
  }, []);

  // Atualizar ref quando conversaSelecionada mudar
  useEffect(() => {
    conversaSelecionadaRef.current = conversaSelecionada;
  }, [conversaSelecionada]);

  // Carregar detalhes da conversa quando selecionada
  useEffect(() => {
    if (conversaSelecionada) {
      carregarDetalhes();
    }
  }, [conversaSelecionada]);

  // Ref para saber se é carga inicial (scroll instantâneo) ou nova mensagem (scroll suave)
  const isFirstLoad = useRef(true);

  // Scroll automático quando novas mensagens chegam ou conversa carrega
  useEffect(() => {
    if (!loadingDetalhes && detalhesConversa?.mensagens && detalhesConversa.mensagens.length > 0) {
      // setTimeout garante que o DOM já renderizou antes de rolar
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: 'smooth',
        });
        isFirstLoad.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loadingDetalhes, conversaSelecionada, detalhesConversa?.mensagens?.length, usuarioDigitando]);

  // Reset isFirstLoad ao trocar de conversa
  useEffect(() => {
    isFirstLoad.current = true;
  }, [conversaSelecionada]);

  // Limpar timeout ao desmontar
  useEffect(() => {
    return () => {
      if (usuarioDigitando?.timeout) {
        clearTimeout(usuarioDigitando.timeout);
      }
    };
  }, [usuarioDigitando]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const carregarDetalhes = async () => {
    if (!conversaSelecionada) return;

    try {
      setLoadingDetalhes(true);

      // Buscar detalhes COMPLETOS da conversa (mensagens + atendimento + cliente)
      const detalhes = await chatApi.obterConversa(conversaSelecionada);

      console.log(`📊 Conversa carregada:`, detalhes);
      console.log(`📊 Mensagens: ${detalhes.mensagens?.length || 0}`);

      // DEBUG: Verificar direção das primeiras mensagens
      if (detalhes.mensagens && detalhes.mensagens.length > 0) {
        console.log(`📊 Primeiras 3 mensagens com direção:`,
          detalhes.mensagens.slice(0, 3).map(m => ({
            id: m.id,
            conteudo: m.conteudo.substring(0, 30),
            direcao: m.direcao
          }))
        );
      }
      console.log(`📊 Atendimento:`, detalhes.atendimento);
      console.log(`📊 Status do atendimento: ${detalhes.atendimento?.status}`);

      // Ordenar mensagens por timestamp (com ID como tie-breaker)
      const mensagensOrdenadas = (detalhes.mensagens || []).sort((a: any, b: any) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        // Se timestamps são iguais, usar ID como critério secundário
        return timeDiff !== 0 ? timeDiff : (a.id || 0) - (b.id || 0);
      });

      console.log(`📊 Mensagens ordenadas: ${mensagensOrdenadas.length}`);

      // Usar os detalhes completos do backend
      setDetalhesConversa({
        whatsapp_number: conversaSelecionada,
        mensagens: mensagensOrdenadas,
        atendimento: detalhes.atendimento, // ✅ Agora carrega o atendimento!
        cliente: detalhes.cliente,
      });

      // Resetar contador de não lidas ao abrir chat (local)
      setConversas(conversas.map(conv =>
        conv.whatsapp_number === conversaSelecionada
          ? { ...conv, nao_lidas: 0 }
          : conv
      ));

      // Marcar mensagens como lidas no backend
      try {
        await api.patch(`/mensagens/${conversaSelecionada}/marcar-todas-lidas`);
      } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
      showToast('Erro ao carregar mensagens', 'error');
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const handleReply = (mensagem: any) => {
    if (!mensagem.message_id) return; // Só responde se tem WAMID
    setReplyTo({
      message_id: mensagem.message_id,
      conteudo: mensagem.conteudo,
      direcao: mensagem.direcao,
    });
    inputRef.current?.focus();
  };

  const handleEnviarMensagem = async (conteudo: string) => {
    if (!conversaSelecionada || !conteudo.trim()) return;
    const currentReply = replyTo;
    setReplyTo(null); // Limpa reply ao enviar

    // Adicionar mensagem IMEDIATAMENTE (optimistic update antes da API)
    const mensagemTemp = {
      id: Date.now(),
      whatsapp_number: conversaSelecionada,
      message_id: null,
      direcao: 'enviada' as const,
      tipo_mensagem: 'text' as const,
      conteudo: conteudo.trim(),
      timestamp: new Date().toISOString(),
      lida: false,
      erro: null,
      dados_extras: currentReply ? {
        reply_to_content: currentReply.conteudo,
        reply_to_direcao: currentReply.direcao,
      } : {},
    };

    adicionarMensagem(mensagemTemp);
    atualizarConversaPreview(conversaSelecionada, conteudo.trim());

    try {
      setEnviandoMensagem(true);

      // Enviar para API e usar resposta real (com context/reply se aplicável)
      const response = await api.post('/mensagens', {
        whatsapp_number: conversaSelecionada,
        conteudo: conteudo.trim(),
        tipo_mensagem: 'text',
        context_message_id: currentReply?.message_id || undefined,
        reply_to_content: currentReply?.conteudo || undefined,
        reply_to_direcao: currentReply?.direcao || undefined,
      });

      // Se backend retornou a mensagem, substituir a temporária
      if (response.data) {
        // Remover mensagem temp e adicionar a real
        const mensagensAtualizadas = detalhesConversa?.mensagens.filter(
          (m) => m.id !== mensagemTemp.id
        ) || [];

        setDetalhesConversa({
          ...detalhesConversa!,
          mensagens: [...mensagensAtualizadas, response.data].sort((a, b) => {
            const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            return timeDiff !== 0 ? timeDiff : (a.id || 0) - (b.id || 0);
          }),
        });
      }

    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      showToast(
        error.response?.data?.detail || 'Erro ao enviar mensagem',
        'error'
      );
    } finally {
      setEnviandoMensagem(false);
    }
  };

  const handleAssumir = async () => {
    if (!conversaSelecionada) return;

    try {
      // Usar endpoint que funciona para empresa E atendente
      await api.post(`/chat/atendimento/${conversaSelecionada}/assumir`);
      await carregarDetalhes();
      showToast('Atendimento assumido com sucesso!', 'success');
    } catch (error: any) {
      console.error('Erro ao assumir atendimento:', error);
      showToast(
        error.response?.data?.detail || 'Erro ao assumir atendimento',
        'error'
      );
    }
  };

  const handleFinalizar = () => {
    setModalEncerrarAberto(true);
  };

  const handleEncerrarAtendimento = async (motivo: string, observacao?: string, retornarBot?: boolean, etapaFunil?: string, valorNegocio?: number) => {
    if (!conversaSelecionada) return;

    try {
      await api.post(`/chat/atendimento/${conversaSelecionada}/finalizar`, {
        motivo,
        observacao,
        retornar_bot: retornarBot,
        etapa_funil: etapaFunil,
        valor_negocio: valorNegocio,
      });
      showToast('Atendimento encerrado com sucesso', 'success');
      await carregarDetalhes();
    } catch (error) {
      console.error('Erro ao encerrar atendimento:', error);
      showToast('Erro ao encerrar atendimento', 'error');
      throw error;
    }
  };

  const handleEnviarMidia = async (file: File) => {
    if (!conversaSelecionada) return;
    const currentReply = replyTo;
    setReplyTo(null);

    try {
      setEnviandoMensagem(true);
      const response = await mediaApi.sendMedia(conversaSelecionada, file, undefined, currentReply?.message_id);

      if (response) {
        // Adicionar mensagem de mídia à conversa
        const mensagensAtualizadas = detalhesConversa?.mensagens || [];
        setDetalhesConversa({
          ...detalhesConversa!,
          mensagens: [...mensagensAtualizadas, response].sort((a, b) => {
            const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            return timeDiff !== 0 ? timeDiff : (a.id || 0) - (b.id || 0);
          }),
        });
        atualizarConversaPreview(conversaSelecionada, response.conteudo);
      }
    } catch (error: any) {
      console.error('Erro ao enviar mídia:', error);
      showToast(
        error.response?.data?.detail || 'Erro ao enviar arquivo',
        'error'
      );
    } finally {
      setEnviandoMensagem(false);
    }
  };

  const handleTransferir = () => {
    setModalTransferirAberto(true);
  };

  const handleTransferirAtendimento = async (atendenteId: number, observacao?: string) => {
    if (!conversaSelecionada) return;

    try {
      await api.post(`/chat/atendimento/${conversaSelecionada}/transferir`, {
        atendente_id: atendenteId,
        observacao,
      });
      showToast('Atendimento transferido com sucesso', 'success');
      await carregarDetalhes();
    } catch (error) {
      console.error('Erro ao transferir atendimento:', error);
      showToast('Erro ao transferir atendimento', 'error');
      throw error;
    }
  };

  // WebSocket - receber mensagens em tempo real
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log('📨 WebSocket Chat:', message.event);
    console.log('📦 Dados completos:', JSON.stringify(message, null, 2));

    switch (message.event) {
      case 'nova_mensagem':
        const { mensagem: msgData } = message.data;

        console.log(`📬 Nova mensagem via WebSocket:`, msgData);
        console.log(`📍 Conversa selecionada: ${conversaSelecionadaRef.current}`);
        console.log(`📍 WhatsApp number da mensagem: ${msgData.whatsapp_number}`);
        console.log(`📍 DIREÇÃO DA MENSAGEM:`, msgData.direcao);
        console.log(`📍 Conteúdo:`, msgData.conteudo);

        // Se a mensagem é da conversa atual, adicionar
        console.log(`🔍 Comparando: msgData.whatsapp_number="${msgData.whatsapp_number}" vs conversaSelecionada="${conversaSelecionadaRef.current}"`);

        if (msgData.whatsapp_number === conversaSelecionadaRef.current) {
          console.log(`✅ MATCH! Mensagem é da conversa atual`);
          const novaMensagem = {
            id: msgData.id || Date.now(),
            whatsapp_number: msgData.whatsapp_number,
            message_id: msgData.message_id,
            direcao: msgData.direcao as 'recebida' | 'enviada',
            tipo_mensagem: msgData.tipo_mensagem || 'text',
            conteudo: msgData.conteudo,
            timestamp: msgData.timestamp,
            lida: msgData.lida || false,
            dados_extras: msgData.dados_extras || {},
            erro: null,
          };

          console.log(`✅ Adicionando mensagem:`, novaMensagem);
          adicionarMensagem(novaMensagem);

          // Atualizar preview na sidebar com status do atendimento
          const atendStatus = message.data.atendimento?.status;
          const atendId = message.data.atendimento?.atendente_id;
          const atendIa = message.data.atendimento?.atendido_por_ia;
          const previewUpdates: any = {
            ultima_mensagem: msgData.conteudo,
            timestamp: msgData.timestamp,
          };
          if (atendStatus) {
            previewUpdates.status = atendStatus;
            // Se atendimento voltou para bot sem atendente (pós-encerramento), limpa atendente_nome
            if (atendStatus === 'bot' && atendId == null) {
              previewUpdates.atendente_nome = undefined;
            }
          }
          atualizarConversa(msgData.whatsapp_number, previewUpdates);

          // Atualizar atendido_por_ia nos detalhes (sem clobber mensagens)
          if (atendIa !== undefined) {
            atualizarAtendimentoDetalhes({ atendido_por_ia: atendIa });
          }

          // Notificar apenas se for mensagem recebida
          if (msgData.direcao === 'recebida') {
            showToast(`💬 Nova mensagem de ${msgData.whatsapp_number}`, 'info');
            playNotificationSound();
          }
        } else {
          console.log(`❌ NO MATCH! Mensagem ignorada - não é da conversa atual`);

          // Atualizar sidebar para conversas não selecionadas
          const atendStatusOther = message.data.atendimento?.status;
          const atendIdOther = message.data.atendimento?.atendente_id;

          if (msgData.direcao === 'recebida') {
            const otherUpdates: any = {
              nao_lidas: undefined, // será calculado abaixo
              ultima_mensagem: msgData.conteudo,
              timestamp: msgData.timestamp,
            };
            if (atendStatusOther) {
              otherUpdates.status = atendStatusOther;
              if (atendStatusOther === 'bot' && atendIdOther == null) {
                otherUpdates.atendente_nome = undefined;
              }
            }

            setConversas(conversas.map(conv => {
              if (conv.whatsapp_number === msgData.whatsapp_number) {
                return {
                  ...conv,
                  ...otherUpdates,
                  nao_lidas: (conv.nao_lidas || 0) + 1,
                };
              }
              return conv;
            }));

            showToast(`💬 Nova mensagem de ${msgData.whatsapp_number}`, 'info');
            playNotificationSound();
          }
        }
        break;

      case 'conversa_assumida':
        if (message.data.whatsapp === conversaSelecionadaRef.current) {
          // Limpar badge IA imediatamente antes do refetch
          if (message.data.atendimento) {
            atualizarAtendimentoDetalhes({
              atendido_por_ia: false,
              atendente_id: message.data.atendimento.atendente_id ?? null,
            });
          }
          carregarDetalhes();
        }
        // Atualizar sidebar: marca como em_atendimento e atribui atendente
        atualizarConversa(message.data.whatsapp, {
          atendente_nome: message.data.assumido_por,
          status: 'em_atendimento',
        });
        break;

      case 'conversa_transferida':
        if (message.data.whatsapp === conversaSelecionadaRef.current) {
          carregarDetalhes();
        }
        break;

      case 'atendimento_removido':
        // Empresa assumiu este atendimento — notificar atendente deslocado
        if (message.data.whatsapp_number === conversaSelecionadaRef.current) {
          showToast(
            `⚠️ Atendimento assumido por ${message.data.assumido_por}`,
            'warning'
          );
          carregarDetalhes(); // Recarrega para atualizar status/botões
        }
        break;

      case 'atendimento_transferido':
        // Este atendente recebeu ou perdeu uma transferência
        if (message.data.whatsapp_number === conversaSelecionadaRef.current) {
          showToast(
            `🔄 Atendimento transferido para ${message.data.transferido_para}`,
            'info'
          );
          carregarDetalhes();
        }
        break;

      case 'user_typing':
        // Outro usuário está digitando nesta conversa
        if (message.data.whatsapp === conversaSelecionadaRef.current) {
          // Limpar timeout anterior se existir
          if (usuarioDigitando?.timeout) {
            clearTimeout(usuarioDigitando.timeout);
          }

          // Criar novo timeout de 3 segundos
          const timeout = setTimeout(() => {
            setUsuarioDigitando(null);
          }, 3000);

          setUsuarioDigitando({
            nome: message.data.user_nome || 'Atendente',
            timeout,
          });
        }
        break;

      case 'message_status_update':
        // Status de mensagem atualizado (read/delivered)
        const { message_id, status, lida, id: msg_id } = message.data;

        if (message.data.whatsapp_number === conversaSelecionadaRef.current && detalhesConversa) {
          // Atualizar mensagem na lista
          setDetalhesConversa({
            ...detalhesConversa,
            mensagens: detalhesConversa.mensagens.map(m => {
              if (m.message_id === message_id || m.id === msg_id) {
                return { ...m, lida: lida };
              }
              return m;
            }),
          });

          console.log(`✅ Status atualizado: ${message_id} → ${status}`);
        }
        break;

      case 'conversa_deletada':
        removerConversa(message.data.whatsapp_number);
        break;
    }
  }, [adicionarMensagem, atualizarAtendimentoDetalhes, showToast, usuarioDigitando, removerConversa]);

  // Conectar WebSocket
  const { isConnected, sendMessage } = useWebSocket(token, {
    onMessage: handleWebSocketMessage,
    autoReconnect: true,
  });

  // Handler para enviar evento de digitação
  const handleTyping = useCallback(() => {
    if (conversaSelecionada && sendMessage) {
      sendMessage('typing', {
        whatsapp: conversaSelecionada,
        user_nome: user?.email?.split('@')[0] || 'Usuário',
      });
    }
  }, [conversaSelecionada, sendMessage, user]);

  // Estado vazio (nenhuma conversa selecionada)
  if (!conversaSelecionada) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ backgroundColor: colors.chatBg }}
      >
        <p className="text-[15px] mb-2" style={{ color: colors.textSecondary }}>
          Selecione uma conversa para comecar o atendimento
        </p>
        {isConnected && (
          <p className="text-[13px]" style={{ color: colors.accent }}>
            Conectado em tempo real
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative pb-14 md:pb-0" onKeyDown={handleChatKeyDown} tabIndex={-1}>
      {/* Header */}
      <Header
        conversa={detalhesConversa}
        onVoltar={onVoltar}
        onAssumir={handleAssumir}
        onFinalizar={handleFinalizar}
        onTransferir={handleTransferir}
        onConversaDeletada={() => conversaSelecionada && removerConversa(conversaSelecionada)}
      />

      {/* Banner IA — quando conversa está sendo gerenciada pela IA */}
      {detalhesConversa?.atendimento?.atendido_por_ia && (
        <div style={{
          padding: '6px 16px',
          background: 'rgba(139,92,246,0.12)',
          borderBottom: '1px solid rgba(139,92,246,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#8b5cf6',
        }}>
          <span>🤖</span>
          <span>Este atendimento está sendo gerenciado pela IA. Clique em <strong>Assumir</strong> para responder manualmente.</span>
        </div>
      )}

      {/* Área de mensagens com fundo temático */}
      <div
        className="flex-1 overflow-y-auto p-4 custom-scrollbar"
        onClick={focusInput}
        style={{
          backgroundColor: colors.chatBg,
          ...(theme === 'whatsapp' && {
            backgroundImage: `url(${whatsappBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }),
        }}
      >
        {loadingDetalhes ? (
          <div className="flex items-center justify-center h-full">
            <div
              className="animate-spin rounded-full h-12 w-12 border-b-2"
              style={{ borderColor: colors.primary }}
            ></div>
          </div>
        ) : detalhesConversa?.mensagens.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center" style={{ color: colors.textSecondary }}>
              <div className="text-4xl mb-2">📭</div>
              <p>Nenhuma mensagem ainda</p>
              <p className="text-sm mt-1">Envie uma mensagem para iniciar a conversa</p>
            </div>
          </div>
        ) : (
          <>
            {detalhesConversa?.mensagens.map((mensagem, index) => {
              // Verificar se precisa mostrar separador de data
              const mostrarSeparador = index === 0 ||
                !isSameDay(
                  new Date(mensagem.timestamp),
                  new Date(detalhesConversa.mensagens[index - 1].timestamp)
                );

              return (
                <React.Fragment key={mensagem.id || index}>
                  {mostrarSeparador && <DateSeparator date={mensagem.timestamp} />}
                  <MessageBubble
                    mensagem={mensagem}
                    contactName={detalhesConversa?.cliente?.nome_completo || detalhesConversa?.whatsapp_number}
                    onReply={handleReply}
                  />
                </React.Fragment>
              );
            })}
            {/* Indicador de digitação */}
            {usuarioDigitando && (
              <TypingIndicator nome={usuarioDigitando.nome} />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input de mensagem — bloqueado se outra pessoa tem o chat */}
      {(() => {
        const atend = detalhesConversa?.atendimento;
        const emAtendimento = atend?.status === 'em_atendimento';
        // Empresa não pode enviar se um atendente está responsável
        const empresaBloqueada = user?.role === 'empresa' && emAtendimento && atend?.atendente_id != null;
        // Atendente não pode enviar se outro atendente ou empresa tem o chat
        const atendenteBloqueado = user?.role === 'atendente' && emAtendimento && atend?.atendente_id !== (user as any).atendente_id;
        const bloqueado = empresaBloqueada || atendenteBloqueado;
        const nomeBloqueador = atend?.atendente_nome || 'outro atendente';

        return bloqueado ? (
          <div style={{
            padding: '12px 16px',
            background: colors.cardBg,
            borderTop: `1px solid ${colors.border}`,
            textAlign: 'center',
            color: colors.textSecondary,
            fontSize: 13,
          }}>
            🔒 Atendimento com <strong>{nomeBloqueador}</strong>. Clique em <strong>Assumir</strong> para enviar mensagens.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Barra de reply contextual */}
            {replyTo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: colors.cardBg,
                borderTop: `2px solid ${colors.primary}`,
                borderBottom: `1px solid ${colors.border}`,
                animation: 'slideDownReply 0.15s ease',
              }}>
                <div style={{
                  width: 3, borderRadius: 2, alignSelf: 'stretch',
                  background: replyTo.direcao === 'enviada' ? colors.primary : colors.accent,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: colors.primary, margin: 0 }}>
                    {replyTo.direcao === 'enviada' ? 'Você' : 'Contato'}
                  </p>
                  <p style={{
                    fontSize: 12, color: colors.textSecondary, margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {replyTo.conteudo.length > 100
                      ? replyTo.conteudo.slice(0, 100) + '…'
                      : replyTo.conteudo}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.textSecondary, fontSize: 18, lineHeight: 1, padding: '2px 4px',
                    flexShrink: 0,
                  }}
                  title="Cancelar resposta"
                >
                  ✕
                </button>
              </div>
            )}
            <InputBox
              inputRef={inputRef}
              onEnviar={handleEnviarMensagem}
              onAttachment={handleEnviarMidia}
              onTyping={handleTyping}
              enviando={enviandoMensagem}
              disabled={false}
              conversaSelecionada={conversaSelecionada}
            />
          </div>
        );
      })()}

      {/* Modal Transferir */}
      <TransferirModal
        isOpen={modalTransferirAberto}
        onClose={() => setModalTransferirAberto(false)}
        onTransferir={handleTransferirAtendimento}
        conversaNumero={conversaSelecionada || ''}
      />

      {/* Modal Encerrar */}
      <EncerrarModal
        isOpen={modalEncerrarAberto}
        onClose={() => setModalEncerrarAberto(false)}
        onEncerrar={handleEncerrarAtendimento}
        conversaNumero={conversaSelecionada || ''}
      />
    </div>
  );
};

export default Chat;
