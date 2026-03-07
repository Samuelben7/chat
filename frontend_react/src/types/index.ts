export interface Mensagem {
  id: number;
  whatsapp_number: string;
  message_id?: string;
  direcao: 'recebida' | 'enviada';
  tipo_mensagem: string;
  conteudo: string;
  dados_extras?: any;
  timestamp: string;
  lida: boolean;
}

export interface Cliente {
  id: number;
  nome_completo: string;
  cpf?: string;
  whatsapp_number: string;
  endereco_residencial?: string;
  cidade?: string;
}

export interface Atendente {
  id: number;
  nome_exibicao: string;
  status: 'online' | 'offline' | 'ausente';
  pode_atender: boolean;
  ultima_atividade: string;
}

export interface Atendimento {
  id: number;
  whatsapp_number: string;
  atendente_id?: number;
  status: 'bot' | 'aguardando' | 'em_atendimento' | 'finalizado';
  iniciado_em: string;
  atribuido_em?: string;
  finalizado_em?: string;
  ultima_mensagem_em: string;
  notas_internas?: string;
  atendido_por_ia?: boolean;
}

export interface ConversaPreview {
  whatsapp_number: string;
  cliente_nome?: string;
  ultima_mensagem?: string;
  timestamp?: string;
  nao_lidas: number;
  atendente_nome?: string;
  status: string;
  online_status?: 'online' | 'ausente' | 'offline' | null;
}

export interface ConversaDetalhes {
  whatsapp_number: string;
  cliente?: Cliente;
  atendimento?: Atendimento;
  mensagens: Mensagem[];
}

export interface MensagemCreate {
  whatsapp_number: string;
  conteudo: string;
  tipo_mensagem?: string;
  dados_extras?: any;
}

export interface AtendenteCreate {
  user_id: number;
  nome_exibicao: string;
}

export interface AtendenteUpdate {
  status?: 'online' | 'offline' | 'ausente';
  pode_atender?: boolean;
}

// ==================== TEMPLATES ====================

export type TemplateType = 'standard' | 'coupon' | 'limited_time_offer' | 'catalog' | 'carousel';

export interface CarouselQuickReply {
  id: string;
  title: string;
}

export interface CarouselCard {
  headerType: 'image' | 'video';
  headerUrl: string;
  bodyText: string;
  // button fields (same type across all cards)
  buttonDisplayText?: string;  // for url button
  buttonUrl?: string;          // for url button
  quickReplies?: CarouselQuickReply[];  // for quick_reply buttons
}

export interface TemplateButton {
  type: string;
  text?: string;  // Optional for COPY_CODE buttons
  url?: string;
  phone_number?: string;
  example?: string[] | string;  // string for COPY_CODE, string[] for URL
}

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  example?: any;
  limited_time_offer?: {
    text: string;
    has_expiration?: boolean;
    expiration_time_ms?: number;
  };
}

export interface MessageTemplate {
  id: number;
  empresa_id: number;
  meta_template_id?: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: TemplateComponent[];
  parameter_format?: string;
  quality_score?: string;
  rejected_reason?: string;
  header_image_path?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface TemplateListResponse {
  templates: MessageTemplate[];
  total: number;
  page: number;
  per_page: number;
}

export interface TemplateSendResponse {
  success: boolean;
  message_id?: string;
  whatsapp_number: string;
  error?: string;
}

export interface TemplateBulkSendResponse {
  total: number;
  enviados: number;
  erros: number;
  resultados: TemplateSendResponse[];
  task_id?: string;
}

export interface TemplateSyncResponse {
  criados: number;
  atualizados: number;
  removidos: number;
  total: number;
}

export interface TemplateSendParams {
  whatsapp_number: string;
  language?: string;
  parameter_values?: Record<string, string>;
  media_url?: string;
  components?: any[];
}

export interface TemplateStatusCheck {
  id: number;
  meta_template_id?: string;
  status: string;
  quality_score?: string;
  rejected_reason?: string;
}

export interface ContactNameResponse {
  nome: string | null;
}

export interface MediaUploadResponse {
  url: string;
  filename: string;
  header_handle?: string;
}

// ==================== CONTATOS ====================

export interface ContatoUnificado {
  whatsapp_number: string;
  nome?: string;
  cidade?: string;
  cliente_id?: number;
  registrado: boolean;
  ultimo_contato?: string;
  total_mensagens: number;
}

export interface ContatoListResponse {
  contatos: ContatoUnificado[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListaContatos {
  id: number;
  empresa_id: number;
  nome: string;
  descricao?: string;
  cor: string;
  total_membros: number;
  criado_em: string;
  atualizado_em: string;
}
