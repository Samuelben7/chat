import { create } from 'zustand';
import {
  ConversaPreview,
  ConversaDetalhes,
  Mensagem,
  Atendente,
} from '../types';

interface ChatState {
  // Conversas
  conversas: ConversaPreview[];
  conversaSelecionada: string | null;
  detalhesConversa: ConversaDetalhes | null;

  // Atendente atual
  atendenteAtual: Atendente | null;

  // Loading states
  loadingConversas: boolean;
  loadingDetalhes: boolean;
  enviandoMensagem: boolean;

  // Actions
  setConversas: (conversas: ConversaPreview[]) => void;
  setSelecionarConversa: (whatsappNumber: string) => void;
  setDetalhesConversa: (detalhes: ConversaDetalhes | null) => void;
  atualizarAtendimentoDetalhes: (updates: Partial<import('../types').Atendimento>) => void;
  setAtendenteAtual: (atendente: Atendente | null) => void;
  adicionarMensagem: (mensagem: Mensagem) => void;
  atualizarConversaPreview: (whatsappNumber: string, ultimaMensagem: string) => void;
  atualizarConversa: (whatsappNumber: string, updates: Partial<ConversaPreview>) => void;
  setLoadingConversas: (loading: boolean) => void;
  setLoadingDetalhes: (loading: boolean) => void;
  setEnviandoMensagem: (enviando: boolean) => void;
  limparConversaSelecionada: () => void;
  removerConversa: (whatsappNumber: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // Estado inicial
  conversas: [],
  conversaSelecionada: null,
  detalhesConversa: null,
  atendenteAtual: null,
  loadingConversas: false,
  loadingDetalhes: false,
  enviandoMensagem: false,

  // Actions
  setConversas: (conversas) => set({ conversas }),

  setSelecionarConversa: (whatsappNumber) =>
    set({ conversaSelecionada: whatsappNumber, detalhesConversa: null }),

  setDetalhesConversa: (detalhes) => set({ detalhesConversa: detalhes }),

  // Atualiza apenas o atendimento dentro de detalhesConversa (sem clobber mensagens)
  atualizarAtendimentoDetalhes: (updates) =>
    set((state) => {
      if (!state.detalhesConversa?.atendimento) return state;
      return {
        detalhesConversa: {
          ...state.detalhesConversa,
          atendimento: { ...state.detalhesConversa.atendimento, ...updates },
        },
      };
    }),

  setAtendenteAtual: (atendente) => set({ atendenteAtual: atendente }),

  adicionarMensagem: (mensagem) =>
    set((state) => {
      if (!state.detalhesConversa) return state;

      // ✅ VERIFICAR SE JÁ EXISTE (evita duplicatas) - APENAS POR ID EXATO
      const jaExiste = state.detalhesConversa.mensagens.some(
        (m) => m.id === mensagem.id
      );

      if (jaExiste) {
        console.log(`⚠️ Mensagem ${mensagem.id} já existe, não adicionar duplicata`);
        return state;
      }

      console.log(`✅ Adicionando mensagem ${mensagem.id}: ${mensagem.conteudo.substring(0, 30)}`)

      // Adicionar mensagem e reordenar por timestamp (com ID como tie-breaker)
      const novasMensagens = [...state.detalhesConversa.mensagens, mensagem].sort((a, b) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        // Se timestamps são iguais, usar ID como critério secundário
        return timeDiff !== 0 ? timeDiff : (a.id || 0) - (b.id || 0);
      });

      return {
        detalhesConversa: {
          ...state.detalhesConversa,
          mensagens: novasMensagens,
        },
      };
    }),

  atualizarConversaPreview: (whatsappNumber, ultimaMensagem) =>
    set((state) => ({
      conversas: state.conversas.map((conv) =>
        conv.whatsapp_number === whatsappNumber
          ? {
              ...conv,
              ultima_mensagem: ultimaMensagem,
              timestamp: new Date().toISOString(),
            }
          : conv
      ),
    })),

  atualizarConversa: (whatsappNumber, updates) =>
    set((state) => ({
      conversas: state.conversas.map((conv) =>
        conv.whatsapp_number === whatsappNumber
          ? { ...conv, ...updates }
          : conv
      ),
    })),

  setLoadingConversas: (loading) => set({ loadingConversas: loading }),

  setLoadingDetalhes: (loading) => set({ loadingDetalhes: loading }),

  setEnviandoMensagem: (enviando) => set({ enviandoMensagem: enviando }),

  limparConversaSelecionada: () =>
    set({
      conversaSelecionada: null,
      detalhesConversa: null,
    }),

  removerConversa: (whatsappNumber) =>
    set((state) => ({
      conversas: state.conversas.filter((c) => c.whatsapp_number !== whatsappNumber),
      conversaSelecionada: state.conversaSelecionada === whatsappNumber ? null : state.conversaSelecionada,
      detalhesConversa: state.conversaSelecionada === whatsappNumber ? null : state.detalhesConversa,
    })),
}));
