import api from './api';

// ==================== DEV AUTH ====================

export const devAuthApi = {
  register: async (dados: {
    nome: string;
    email: string;
    senha: string;
    telefone?: string;
    empresa_nome?: string;
  }) => {
    const response = await api.post('/auth/dev/register', dados);
    return response.data;
  },

  login: async (email: string, senha: string) => {
    const response = await api.post('/auth/dev/login', { email, senha });
    return response.data;
  },

  getPerfil: async () => {
    const response = await api.get('/auth/dev/perfil');
    return response.data;
  },

  connectWhatsApp: async (dados: { code: string; phone_number_id: string; waba_id: string }) => {
    const response = await api.post('/auth/dev/connect-whatsapp', dados);
    return response.data;
  },

  getWhatsAppStatus: async () => {
    const response = await api.get('/auth/dev/whatsapp-status');
    return response.data;
  },
};

// ==================== API KEYS ====================

export const devApiKeysApi = {
  criar: async (nome?: string) => {
    const response = await api.post('/dev/api-keys', { nome });
    return response.data;
  },

  listar: async () => {
    const response = await api.get('/dev/api-keys');
    return response.data;
  },

  revogar: async (id: number) => {
    const response = await api.delete(`/dev/api-keys/${id}`);
    return response.data;
  },

  rotacionar: async (id: number) => {
    const response = await api.post(`/dev/api-keys/${id}/rotate`);
    return response.data;
  },
};

// ==================== USAGE ====================

export const devUsageApi = {
  getUsage: async () => {
    const response = await api.get('/dev/usage');
    return response.data;
  },

  getHistory: async (days: number = 30) => {
    const response = await api.get('/dev/usage/history', { params: { days } });
    return response.data;
  },
};

// ==================== WEBHOOK ====================

export const devWebhookApi = {
  getConfig: async () => {
    const response = await api.get('/dev/webhook/config');
    return response.data;
  },

  setConfig: async (webhook_url: string) => {
    const response = await api.post('/dev/webhook/config', { webhook_url });
    return response.data;
  },

  test: async () => {
    const response = await api.post('/dev/webhook/test');
    return response.data;
  },

  getLogs: async (limit: number = 20) => {
    const response = await api.get('/dev/webhook/logs', { params: { limit } });
    return response.data;
  },
};

// ==================== NUMEROS (MULTI-NUMERO) ====================

export const devNumerosApi = {
  listar: async () => {
    const response = await api.get('/dev/numeros');
    return response.data;
  },

  conectar: async (dados: { code: string; phone_number_id: string; waba_id: string }) => {
    const response = await api.post('/dev/numeros/connect', dados);
    return response.data;
  },

  cancelar: async (id: number) => {
    const response = await api.delete(`/dev/numeros/${id}`);
    return response.data;
  },

  salvarCartao: async (dados: { card_token: string; payment_method_id: string; last4: string }) => {
    const response = await api.post('/dev/numeros/pagamento/salvar-cartao', dados);
    return response.data;
  },

  statusCartao: async () => {
    const response = await api.get('/dev/numeros/pagamento/status-cartao');
    return response.data;
  },

  removerCartao: async () => {
    const response = await api.delete('/dev/numeros/pagamento/cartao');
    return response.data;
  },

  gerarSignupLink: async (redirect_back_url?: string) => {
    const response = await api.post('/dev/numeros/signup-link', { redirect_back_url });
    return response.data as { signup_url: string; expires_in: number; session_id: string };
  },

  getStatus: async (numero_id: number) => {
    const response = await api.get(`/dev/numeros/${numero_id}/status`);
    return response.data;
  },
};

// ==================== PLANOS & ASSINATURAS ====================

export const planosApi = {
  listar: async () => {
    const response = await api.get('/planos');
    return response.data;
  },

  listarEmpresa: async () => {
    const response = await api.get('/planos/empresa');
    return response.data;
  },

  listarDev: async () => {
    const response = await api.get('/planos/dev');
    return response.data;
  },
};

export const assinaturaApi = {
  getMinha: async () => {
    const response = await api.get('/assinatura/minha');
    return response.data;
  },

  criar: async (plano_id: number) => {
    const response = await api.post('/assinatura/criar', { plano_id });
    return response.data;
  },
};

// ==================== PAGAMENTOS PLATAFORMA ====================

export const pagamentosPlataformaApi = {
  gerarPix: async (assinatura_id: number, email: string) => {
    const response = await api.post('/pagamentos/pix', { assinatura_id, email });
    return response.data;
  },

  pagarCartao: async (dados: {
    assinatura_id: number;
    token_cartao: string;
    email: string;
    parcelas?: number;
  }) => {
    const response = await api.post('/pagamentos/cartao', dados);
    return response.data;
  },

  meusPagamentos: async () => {
    const response = await api.get('/pagamentos/meus');
    return response.data;
  },

  verificarStatus: async (payment_id: string) => {
    const response = await api.get(`/pagamentos/status/${payment_id}`);
    return response.data;
  },
};
