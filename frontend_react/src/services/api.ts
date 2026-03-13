import axios from 'axios';
import {
  ConversaPreview,
  ConversaDetalhes,
  Mensagem,
  MensagemCreate,
  Atendente,
  AtendenteCreate,
  AtendenteUpdate,
  TemplateListResponse,
  MessageTemplate,
  TemplateSendResponse,
  TemplateBulkSendResponse,
  TemplateSyncResponse,
  TemplateSendParams,
  TemplateStatusCheck,
  ContactNameResponse,
  MediaUploadResponse,
  ContatoListResponse,
  ListaContatos,
} from '../types';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.yoursystem.dev.br/api/v1';

// DEBUG: Verificar qual URL está sendo usada
console.log('🔧 API_BASE_URL:', API_BASE_URL);
console.log('🔧 REACT_APP_API_URL env:', process.env.REACT_APP_API_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@WhatsApp:token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==================== CHAT ====================

export const chatApi = {
  // Listar conversas (sidebar)
  listarConversas: async (status?: string, atendenteId?: number): Promise<ConversaPreview[]> => {
    const params: any = {};
    if (status) params.status = status;
    if (atendenteId) params.atendente_id = atendenteId;

    const response = await api.get('/chat/conversas', { params });
    return response.data;
  },

  // Obter detalhes da conversa
  obterConversa: async (whatsappNumber: string): Promise<ConversaDetalhes> => {
    const response = await api.get(`/chat/conversa/${whatsappNumber}`);
    return response.data;
  },

  // Assumir atendimento
  assumirAtendimento: async (whatsappNumber: string, atendenteId: number) => {
    const response = await api.post(`/chat/atendimento/${whatsappNumber}/assumir`, {
      atendente_id: atendenteId,
    });
    return response.data;
  },

  // Finalizar atendimento
  finalizarAtendimento: async (whatsappNumber: string) => {
    const response = await api.post(`/chat/atendimento/${whatsappNumber}/finalizar`);
    return response.data;
  },

  // Transferir para bot
  transferirParaBot: async (whatsappNumber: string) => {
    const response = await api.post(`/chat/atendimento/${whatsappNumber}/transferir-bot`);
    return response.data;
  },

  // Atualizar notas internas
  atualizarNotas: async (atendimentoId: number, notas: string) => {
    const response = await api.patch(`/chat/atendimento/${atendimentoId}`, {
      notas_internas: notas,
    });
    return response.data;
  },

  // Deletar conversa (empresa only)
  deletarConversa: async (whatsappNumber: string) => {
    const response = await api.delete(`/chat/conversa/${whatsappNumber}`);
    return response.data;
  },

  // Configuração de encerramento
  getConfigEncerramento: async (): Promise<{ mensagem_encerramento: string; pesquisa_satisfacao_ativa: boolean }> => {
    const response = await api.get('/chat/config-encerramento');
    return response.data;
  },

  updateConfigEncerramento: async (dados: { mensagem_encerramento?: string; pesquisa_satisfacao_ativa?: boolean }) => {
    const response = await api.patch('/chat/config-encerramento', dados);
    return response.data;
  },
};

// ==================== MENSAGENS ====================

export const mensagensApi = {
  // Enviar mensagem
  enviarMensagem: async (mensagem: MensagemCreate): Promise<Mensagem> => {
    const response = await api.post('/mensagens', mensagem);
    return response.data;
  },

  // Listar mensagens
  listarMensagens: async (whatsappNumber: string, limit = 100): Promise<Mensagem[]> => {
    const response = await api.get(`/mensagens/${whatsappNumber}`, {
      params: { limit },
    });
    return response.data;
  },

  // Marcar como lida
  marcarComoLida: async (messageId: string) => {
    const response = await api.patch(`/mensagens/${messageId}/marcar-lida`);
    return response.data;
  },

  // Contar não lidas
  contarNaoLidas: async (whatsappNumber: string): Promise<{ nao_lidas: number }> => {
    const response = await api.get(`/mensagens/${whatsappNumber}/nao-lidas`);
    return response.data;
  },
};

// ==================== ATENDENTES ====================

export const atendentesApi = {
  // Listar atendentes
  listar: async (status?: string): Promise<Atendente[]> => {
    const params: any = {};
    if (status) params.status = status;

    const response = await api.get('/atendentes', { params });
    return response.data;
  },

  // Obter atendente
  obter: async (id: number): Promise<Atendente> => {
    const response = await api.get(`/atendentes/${id}`);
    return response.data;
  },

  // Criar atendente
  criar: async (dados: AtendenteCreate): Promise<Atendente> => {
    const response = await api.post('/atendentes', dados);
    return response.data;
  },

  // Atualizar atendente
  atualizar: async (id: number, dados: AtendenteUpdate): Promise<Atendente> => {
    const response = await api.patch(`/atendentes/${id}`, dados);
    return response.data;
  },

  // Marcar como online
  marcarOnline: async (id: number) => {
    const response = await api.post(`/atendentes/${id}/online`);
    return response.data;
  },

  // Marcar como offline
  marcarOffline: async (id: number) => {
    const response = await api.post(`/atendentes/${id}/offline`);
    return response.data;
  },

  // Estatísticas
  estatisticas: async (id: number) => {
    const response = await api.get(`/atendentes/${id}/estatisticas`);
    return response.data;
  },

  // Deletar atendente (empresa only)
  deletar: async (id: number) => {
    const response = await api.delete(`/atendentes/${id}`);
    return response.data;
  },
};

// ==================== TEMPLATES ====================

export const templatesApi = {
  listar: async (params?: { page?: number; per_page?: number; status?: string; category?: string; search?: string }): Promise<TemplateListResponse> => {
    const response = await api.get('/templates', { params });
    return response.data;
  },

  criar: async (dados: any): Promise<MessageTemplate> => {
    const response = await api.post('/templates', dados);
    return response.data;
  },

  editar: async (id: number, dados: any): Promise<MessageTemplate> => {
    const response = await api.patch(`/templates/${id}`, dados);
    return response.data;
  },

  deletar: async (id: number): Promise<void> => {
    await api.delete(`/templates/${id}`);
  },

  enviar: async (templateId: number, dados: TemplateSendParams): Promise<TemplateSendResponse> => {
    const response = await api.post(`/templates/${templateId}/send`, dados);
    return response.data;
  },

  enviarMassa: async (dados: any): Promise<TemplateBulkSendResponse> => {
    const response = await api.post('/templates/send-bulk', dados);
    return response.data;
  },

  sincronizar: async (): Promise<TemplateSyncResponse> => {
    const response = await api.post('/templates/sync');
    return response.data;
  },

  checkStatus: async (id: number): Promise<TemplateStatusCheck> => {
    const response = await api.get(`/templates/${id}/check-status`);
    return response.data;
  },

  getContactName: async (number: string): Promise<ContactNameResponse> => {
    const response = await api.get('/templates/contact-name', { params: { number } });
    return response.data;
  },

  uploadMedia: async (file: File): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/templates/upload-media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// ==================== CATÁLOGO (Meta Commerce) ====================

export const catalogoApi = {
  detectar: async (): Promise<{ catalog_id: string | null; vinculado: boolean }> => {
    const response = await api.get('/catalog/detect');
    return response.data;
  },

  listarProdutos: async (params?: { catalog_id?: string; limit?: number }): Promise<{
    catalog_id: string;
    products: any[];
    paging: any;
    total: number;
  }> => {
    const response = await api.get('/catalog', { params });
    return response.data;
  },
};

// ==================== CONTATOS ====================

export const contatosApi = {
  listar: async (params?: { page?: number; per_page?: number; search?: string; tipo?: string }): Promise<ContatoListResponse> => {
    const response = await api.get('/contatos', { params });
    return response.data;
  },

  exportar: async (): Promise<Blob> => {
    const response = await api.get('/contatos/exportar', { responseType: 'blob' });
    return response.data;
  },

  listarListas: async (): Promise<ListaContatos[]> => {
    const response = await api.get('/contatos/listas');
    return response.data;
  },

  criarLista: async (dados: { nome: string; descricao?: string; cor?: string }): Promise<ListaContatos> => {
    const response = await api.post('/contatos/listas', dados);
    return response.data;
  },

  adicionarALista: async (listaId: number, contatos: any[]): Promise<any> => {
    const response = await api.post(`/contatos/listas/${listaId}/adicionar`, { contatos });
    return response.data;
  },

  deletarLista: async (listaId: number): Promise<void> => {
    await api.delete(`/contatos/listas/${listaId}`);
  },

  importarCSV: async (file: File, listaId?: number): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const params: any = {};
    if (listaId) params.lista_id = listaId;
    const response = await api.post('/contatos/importar-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    });
    return response.data;
  },

  // Deletar contato e histórico (empresa only)
  deletarContato: async (whatsappNumber: string): Promise<void> => {
    await api.delete(`/contatos/${whatsappNumber}`);
  },
};

// ==================== MEDIA ====================

export const mediaApi = {
  // URL do proxy para exibir mídia recebida (sem salvar no servidor)
  getProxyUrl: (mediaId: string): string =>
    `${API_BASE_URL}/media/${mediaId}`,

  // Enviar arquivo de mídia para o cliente via WhatsApp
  sendMedia: async (whatsappNumber: string, file: File, caption?: string, contextMessageId?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('whatsapp_number', whatsappNumber);
    if (caption) formData.append('caption', caption);
    if (contextMessageId) formData.append('context_message_id', contextMessageId);

    const response = await api.post('/media/send', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// ==================== EMBEDDED SIGNUP ====================

export const embeddedSignupApi = {
  connectWhatsApp: async (dados: { code: string; phone_number_id: string; waba_id: string }) => {
    const response = await api.post('/auth/empresa/connect-whatsapp', dados);
    return response.data;
  },

  getWhatsAppStatus: async (): Promise<{ conectado: boolean; phone_number_id: string | null; waba_id: string | null }> => {
    const response = await api.get('/auth/empresa/whatsapp-status');
    return response.data;
  },
};

// ==================== WHATSAPP PROFILE ====================

export interface WhatsAppProfile {
  conectado: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  quality_rating: string | null;
  name_status: string | null;
  about: string | null;
  profile_picture_url: string | null;
  token_preview: string | null;
}

export const whatsappProfileApi = {
  getMyProfile: async (): Promise<WhatsAppProfile> => {
    const response = await api.get('/auth/empresa/whatsapp-profile');
    return response.data;
  },
  getEmpresaProfile: async (empresaId: number): Promise<WhatsAppProfile> => {
    const response = await api.get(`/auth/admin/empresa/${empresaId}/whatsapp-profile`);
    return response.data;
  },
};

// ==================== ADMIN ====================

export const adminApi = {
  listarEmpresas: async () => {
    const response = await api.get('/auth/admin/empresas');
    return response.data;
  },

  // Devs
  listarDevs: async (page = 1, status?: string) => {
    const params: any = { page, per_page: 20 };
    if (status) params.status = status;
    const response = await api.get('/admin/devs', { params });
    return response.data;
  },
  bloquearDev: async (devId: number) => {
    const response = await api.post(`/admin/devs/${devId}/block`);
    return response.data;
  },
  desbloquearDev: async (devId: number) => {
    const response = await api.post(`/admin/devs/${devId}/unblock`);
    return response.data;
  },

  // Pagamentos
  listarPagamentos: async (page = 1, filters: Record<string, string> = {}) => {
    const response = await api.get('/admin/pagamentos', { params: { page, per_page: 20, ...filters } });
    return response.data;
  },
  totaisPagamentos: async () => {
    const response = await api.get('/admin/pagamentos/totais');
    return response.data;
  },
  reembolsarPagamento: async (pagamentoId: number) => {
    const response = await api.post(`/admin/pagamentos/${pagamentoId}/reembolso`);
    return response.data;
  },

  // Planos
  listarPlanos: async () => {
    const response = await api.get('/admin/planos');
    return response.data;
  },
  criarPlano: async (dados: any) => {
    const response = await api.post('/admin/planos', dados);
    return response.data;
  },
  atualizarPlano: async (planoId: number, dados: any) => {
    const response = await api.put(`/admin/planos/${planoId}`, dados);
    return response.data;
  },
  deletarPlano: async (planoId: number) => {
    const response = await api.delete(`/admin/planos/${planoId}`);
    return response.data;
  },
};

// ==================== PERFIL WHATSAPP BUSINESS ====================

export const perfilWhatsAppApi = {
  obter: async (): Promise<{ success: boolean; perfil: any; categorias: any[] }> => {
    const response = await api.get('/perfil-whatsapp');
    return response.data;
  },

  atualizar: async (dados: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    vertical?: string;
    websites?: string[];
  }): Promise<{ success: boolean; campos_atualizados: string[] }> => {
    const response = await api.patch('/perfil-whatsapp', dados);
    return response.data;
  },

  atualizarFoto: async (file: File): Promise<{ success: boolean; handle: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/perfil-whatsapp/foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export default api;
