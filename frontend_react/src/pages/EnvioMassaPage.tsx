import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import api from '../services/api';
import whatsappBg from '../images/PLANO-DE-FUNDO-WHATS-APP.png';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Template {
  id: number;
  name: string;
  category: string;
  language: string;
  status: string;
  components: any[];
  header_image_path?: string;
}

interface ContatoSistema {
  whatsapp_number: string;
  nome?: string;
  na_janela_24h?: boolean;
}

interface Lista {
  id: number;
  nome: string;
  descricao?: string;
  cor?: string;
  total_membros: number;
}

interface Contato24h {
  whatsapp_number: string;
  nome?: string;
  ultima_mensagem_recebida?: string;
  minutos_restantes: number;
}

interface ResultadoEnvio {
  total: number;
  enviados: number;
  erros: number;
  fora_janela?: number;
  resultados: { success: boolean; whatsapp_number: string; message_id?: string; error?: string }[];
  task_id?: string;
}

// ==================== UTILITÁRIO DE URL (CONECTADO AO FASTAPI) ====================
const getFullUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  
  let baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  baseUrl = baseUrl.split('/api')[0];
  
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${baseUrl}${cleanPath}`;
};

// ─── Preview Component (iPhone Style Premium) ─────────────────────────────────────────

const MessagePreview: React.FC<{ 
  body: string; 
  header?: string; 
  footer?: string; 
  buttons?: string[];
  isCarousel?: boolean;
  carouselCards?: any[];
  headerUrl?: string;
}> = ({ body, header, footer, buttons, isCarousel, carouselCards, headerUrl }) => {
  const { colors, theme } = useTheme();
  
  const bubbleBg = theme === 'whatsapp' ? (theme === 'dark' ? '#1B272E' : '#FFFFFF') : colors.cardBg;
  const bubbleText = theme === 'whatsapp' ? (theme === 'dark' ? '#E9EDEF' : '#111B21') : colors.textPrimary;
  const secondaryText = theme === 'whatsapp' ? (theme === 'dark' ? '#8696A0' : '#667781') : colors.textSecondary;

  return (
    <div className="flex justify-center items-center py-6 rounded-[3rem] border transition-all duration-700 shadow-2xl" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.02)', borderColor: colors.border }}>
      {/* FRAME DO IPHONE REALISTA */}
      <div className="relative w-[280px] h-[580px] bg-[#000] rounded-[3.2rem] border-[9px] border-[#1a1a1a] shadow-2xl overflow-hidden scale-95 origin-top ring-2 ring-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-50 flex items-center justify-center gap-2">
           <div className="w-10 h-1 bg-white/10 rounded-full" />
           <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
        </div>
        
        {/* WhatsApp Header Mockup */}
        <div className="absolute top-0 w-full h-20 flex items-end p-3 z-30 shadow-md" style={{ background: theme === 'whatsapp' ? (theme === 'dark' ? '#202C33' : '#075E54') : colors.sidebarBg }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white text-[9px] border border-white/20 font-black shadow-lg">WA</div>
            <div className="flex flex-col">
              <span className="text-white text-[11px] font-black uppercase tracking-tight">WhatsApp Preview</span>
              <span className="text-white/60 text-[8px] font-bold flex items-center gap-1">online <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" /></span>
            </div>
          </div>
        </div>

        <div className="w-full h-full pt-20 pb-10 px-3 flex flex-col justify-start overflow-hidden relative" style={{ backgroundImage: `url(${whatsappBg})`, backgroundSize: 'cover', backgroundBlendMode: theme === 'dark' ? 'multiply' : 'normal', backgroundColor: theme === 'dark' ? '#0B141A' : 'transparent' }}>
          
          <div className="flex flex-col items-start w-full mt-4 space-y-3 relative z-10 no-scrollbar overflow-y-auto max-h-full pb-10">
            
            {/* BALÃO DE TEXTO */}
            <div className="w-[94%] relative animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="shadow-2xl p-0 overflow-hidden border border-black/5" style={{ background: bubbleBg, borderRadius: '0 16px 16px 16px' }}>
                
                {/* Header Media */}
                {!isCarousel && headerUrl && (
                  <div className="aspect-video bg-black/10 flex items-center justify-center overflow-hidden border-b border-black/5">
                    <img src={getFullUrl(headerUrl)} className="w-full h-full object-cover" alt="header" />
                  </div>
                )}

                <div className="p-3.5 space-y-1.5">
                  {header && !headerUrl && <p className="text-[12px] font-black leading-tight uppercase tracking-tight" style={{ color: colors.primary }}>{header}</p>}
                  
                  <p className="text-[11.5px] leading-[1.5] font-medium" style={{ color: bubbleText }}>{body || 'Visualização da mensagem...'}</p>

                  {footer && <p className="text-[10px] mt-1.5 opacity-60 font-medium" style={{ color: secondaryText }}>{footer}</p>}

                  <div className="flex justify-end items-center gap-1 mt-1">
                    <span className="text-[9px] opacity-50" style={{ color: secondaryText }}>12:45</span>
                    <span className="text-[12px] leading-none" style={{ color: '#53bdeb' }}>✓✓</span>
                  </div>
                </div>

                {buttons && buttons.length > 0 && (
                  <div className="border-t" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                    {/* 2 botões lado a lado quando <=2, senão empilhar */}
                    {buttons.length <= 2 ? (
                      <div className="flex divide-x" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                        {buttons.map((btn, i) => (
                          <button key={i} className="flex-1 py-2.5 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-black/5 transition-colors" style={{ color: colors.primary }}>
                            {btn}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                        {/* Primeiros 2 lado a lado */}
                        <div className="flex divide-x" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                          {buttons.slice(0, 2).map((btn, i) => (
                            <button key={i} className="flex-1 py-2.5 text-[11px] font-black flex items-center justify-center hover:bg-black/5 transition-colors" style={{ color: colors.primary }}>
                              {btn}
                            </button>
                          ))}
                        </div>
                        {/* Terceiro sozinho */}
                        <button className="w-full py-2.5 text-[11px] font-black flex items-center justify-center hover:bg-black/5 transition-colors" style={{ color: colors.primary }}>
                          {buttons[2]}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="absolute top-0 -left-1.5 w-3 h-3 transition-all" style={{ backgroundColor: bubbleBg, clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
            </div>

            {/* CARDS DO CARROSSEL */}
            {isCarousel && carouselCards && carouselCards.length > 0 && (
              <div className="flex gap-3 overflow-x-auto w-full no-scrollbar px-1 py-4 snap-x pl-1">
                {carouselCards.map((card, idx) => (
                  <div key={idx} className="snap-start flex-shrink-0 w-40 rounded-[1.2rem] overflow-hidden shadow-2xl border border-black/5 transition-transform duration-500 hover:scale-[1.02]" style={{ background: bubbleBg }}>
                    <div className="h-24 bg-black/10 flex items-center justify-center overflow-hidden relative group">
                      {(card.headerUrl || card.header?.image?.link) ? (
                        <img src={getFullUrl(card.headerUrl || card.header?.image?.link)} className="w-full h-full object-cover" alt={`card-${idx}`} />
                      ) : (
                        <span className="text-3xl opacity-20">🖼️</span>
                      )}
                    </div>
                    
                    <div className="p-3 min-h-[70px] flex flex-col justify-between">
                      <p className="text-[10px] leading-tight line-clamp-3 font-medium mb-2" style={{ color: bubbleText }}>
                        {card.bodyText || card.body?.text || 'Título do card...'}
                      </p>
                      
                      <button className="w-full py-2 rounded-lg border text-[9px] font-black uppercase tracking-widest" style={{ color: colors.primary, borderColor: `${colors.primary}33` }}>
                         {card.buttonDisplayText || card.action?.buttons?.[0]?.text || 'Ver Detalhes'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

const EnvioMassaPage: React.FC = () => {
  const navigate = useNavigate();
  const { colors, theme } = useTheme();
  const { t } = useLanguage();

  // Mode: 'mensagem' (free text 24h) or 'template'
  const [modo, setModo] = useState<'mensagem' | 'template'>('mensagem');

  // Shared state
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [contatos24h, setContatos24h] = useState<Contato24h[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);

  // Mensagem mode
  const [mensagemTexto, setMensagemTexto] = useState('');
  const [contatosSelecionados, setContatosSelecionados] = useState<Set<string>>(new Set());
  const [tipoMensagem, setTipoMensagem] = useState<'text' | 'image' | 'button' | 'list'>('text');
  const [msgImgUrl, setMsgImgUrl] = useState('');
  const [msgHeader, setMsgHeader] = useState('');
  const [msgFooter, setMsgFooter] = useState('');
  const [msgHeaderImgUrl, setMsgHeaderImgUrl] = useState('');
  const [msgBotoes, setMsgBotoes] = useState([{ title: '' }, { title: '' }]);
  const [msgListaBtnText, setMsgListaBtnText] = useState('Ver opções');
  const [msgListaSecoes, setMsgListaSecoes] = useState([{
    title: 'Opções',
    rows: [{ id: 'row_1', title: '', description: '' }, { id: 'row_2', title: '', description: '' }],
  }]);
  const [uploadingImg, setUploadingImg] = useState<'main' | 'header' | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const headerImgInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const SERVER_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1').replace('/api/v1', '');

  const uploadImagem = async (file: File, tipo: 'main' | 'header') => {
    setUploadingImg(tipo);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/bot-builder/upload-imagem', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fullUrl = `${SERVER_BASE}${res.data.url}`;
      if (tipo === 'main') setMsgImgUrl(fullUrl);
      else setMsgHeaderImgUrl(fullUrl);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro no upload da imagem');
    } finally {
      setUploadingImg(null);
    }
  };

  // Template mode
  const [templateSelecionado, setTemplateSelecionado] = useState<Template | null>(null);
  const [fonteContato, setFonteContato] = useState<'contatos' | 'numeros'>('contatos');
  const [listaSelecionada, setListaSelecionada] = useState<number | null>(null);
  const [numerosTexto, setNumerosTexto] = useState('');
  const [useContactName, setUseContactName] = useState(true);
  const [fallbackName, setFallbackName] = useState('Olá');
  const [couponCode, setCouponCode] = useState('');
  const [customParams, setCustomParams] = useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [contatosSistema, setContatosSistema] = useState<ContatoSistema[]>([]);
  const [contatosSelecionadosTpl, setContatosSelecionadosTpl] = useState<Set<string>>(new Set());
  const [filtro24hTpl, setFiltro24hTpl] = useState(false);
  const [buscaContato, setBuscaContato] = useState('');

  // Recarregar janela 24h separadamente (usuario pode ter mandado msg depois de abrir a pagina)
  const recarregarJanela = useCallback(async () => {
    try {
      const [janela24h, contatosRes] = await Promise.all([
        api.get('/mensagens/contatos-janela-24h').catch(() => ({ data: { contatos: [] } })),
        api.get('/contatos?per_page=100').catch(() => ({ data: { contatos: [] } })),
      ]);
      const janela = janela24h.data.contatos || [];
      setContatos24h(janela);
      const janela24hNums = new Set(janela.map((c: Contato24h) => c.whatsapp_number));
      const todosContatos: ContatoSistema[] = (contatosRes.data?.contatos || contatosRes.data || []).map((c: any) => ({
        whatsapp_number: c.whatsapp_number,
        nome: c.nome,
        na_janela_24h: janela24hNums.has(c.whatsapp_number),
      }));
      janela.forEach((c: Contato24h) => {
        if (!todosContatos.find((x: ContatoSistema) => x.whatsapp_number === c.whatsapp_number)) {
          todosContatos.push({ whatsapp_number: c.whatsapp_number, nome: c.nome, na_janela_24h: true });
        }
      });
      setContatosSistema(todosContatos);
    } catch (e) { console.error(e); }
  }, []);

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        const [tplApproved, tplCarousel, listasRes, janela24h, contatosRes] = await Promise.all([
          api.get('/templates?status=APPROVED&per_page=100').catch(() => ({ data: { templates: [] } })),
          api.get('/templates?category=INTERACTIVE_CAROUSEL&per_page=100').catch(() => ({ data: { templates: [] } })),
          api.get('/contatos/listas').catch(() => ({ data: [] })),
          api.get('/mensagens/contatos-janela-24h').catch(() => ({ data: { contatos: [] } })),
          api.get('/contatos?per_page=100').catch(() => ({ data: { contatos: [] } })),
        ]);
        const approved = tplApproved.data.templates || tplApproved.data || [];
        const carousels = (tplCarousel.data.templates || tplCarousel.data || [])
          .filter((t: Template) => !approved.find((a: Template) => a.id === t.id));
        setTemplates([...approved, ...carousels]);
        setListas(listasRes.data || []);
        const janela = janela24h.data.contatos || [];
        setContatos24h(janela);
        const janela24hNums = new Set(janela.map((c: Contato24h) => c.whatsapp_number));
        const todosContatos: ContatoSistema[] = (contatosRes.data?.contatos || contatosRes.data || []).map((c: any) => ({
          whatsapp_number: c.whatsapp_number,
          nome: c.nome,
          na_janela_24h: janela24hNums.has(c.whatsapp_number),
        }));
        // Adicionar contatos da janela 24h que não estejam nos registrados
        janela.forEach((c: Contato24h) => {
          if (!todosContatos.find((x: ContatoSistema) => x.whatsapp_number === c.whatsapp_number)) {
            todosContatos.push({ whatsapp_number: c.whatsapp_number, nome: c.nome, na_janela_24h: true });
          }
        });
        setContatosSistema(todosContatos);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Template params helper
  const getTemplateParams = useCallback((): string[] => {
    if (!templateSelecionado) return [];
    const params: string[] = [];
    for (const comp of templateSelecionado.components || []) {
      if (comp.type?.toUpperCase() === 'BODY') {
        const matches = (comp.text || '').match(/\{\{(\d+)\}\}/g);
        if (matches) matches.forEach((m: string) => {
          const n = m.replace(/[{}]/g, '');
          if (!params.includes(n)) params.push(n);
        });
      }
    }
    return params;
  }, [templateSelecionado]);

  const getTemplatePreviewData = () => {
    if (!templateSelecionado) return { body: '' };
    const r: any = { body: '', header: '', footer: '', buttons: [], headerUrl: '' };
    
    // Recupera imagem local se existir no template
    if (templateSelecionado.header_image_path) {
      r.headerUrl = templateSelecionado.header_image_path;
    }

    for (const comp of templateSelecionado.components || []) {
      const t = comp.type?.toUpperCase();
      if (t === 'HEADER') {
        if (comp.format === 'TEXT') r.header = comp.text;
        else if (comp.format === 'IMAGE') {
           // Fallback para handle ou links externos se não tiver path local
           if (!r.headerUrl) r.headerUrl = comp.example?.header_handle?.[0] || comp.image?.link || '';
        }
      }
      if (t === 'BODY') r.body = comp.text || '';
      if (t === 'FOOTER') r.footer = comp.text || '';
      if (t === 'BUTTONS' && comp.buttons) r.buttons = comp.buttons.map((b: any) => b.text || b.type);
    }
    return r;
  };

  const toggleContato = (number: string) => {
    setContatosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const enviarMensagem = async () => {
    if (!mensagemTexto.trim() || contatosSelecionados.size === 0) return;
    setEnviando(true);
    try {
      const payload: any = {
        mensagem: mensagemTexto,
        tipo: tipoMensagem,
        whatsapp_numbers: Array.from(contatosSelecionados),
        apenas_janela_24h: true,
      };
      if (tipoMensagem === 'image' && msgImgUrl) {
        payload.media_url = msgImgUrl;
      } else if (tipoMensagem === 'button') {
        payload.buttons = msgBotoes
          .filter(b => b.title.trim())
          .map((b, i) => ({ id: `btn_${i + 1}`, title: b.title.trim() }));
        if (msgHeader) payload.header = msgHeader;
        if (msgFooter) payload.footer = msgFooter;
        if (msgHeaderImgUrl) payload.header_image_url = msgHeaderImgUrl;
      } else if (tipoMensagem === 'list') {
        payload.button_text = msgListaBtnText || 'Ver opções';
        payload.sections = msgListaSecoes.map(s => ({
          title: s.title,
          rows: s.rows
            .filter(r => r.title.trim())
            .map(r => ({ id: r.id, title: r.title, description: r.description || undefined })),
        })).filter(s => s.rows.length > 0);
        if (msgHeader) payload.header = msgHeader;
        if (msgFooter) payload.footer = msgFooter;
      }
      const res = await api.post('/mensagens/envio-massa', payload);
      setResultado(res.data);
      setStep(99);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  const enviarTemplate = async () => {
    if (!templateSelecionado) return;
    setEnviando(true);
    try {
      const dados: any = {
        template_id: templateSelecionado.id,
        use_contact_name: useContactName,
        fallback_name: fallbackName,
      };
      if (fonteContato === 'contatos') {
        dados.whatsapp_numbers = Array.from(contatosSelecionadosTpl);
      } else {
        dados.whatsapp_numbers = numerosTexto.split('\n').map((n: string) => n.trim()).filter((n: string) => n.length >= 10);
      }
      if (couponCode) dados.coupon_code = couponCode;
      if (mediaUrl) dados.media_url = mediaUrl;
      if (Object.keys(customParams).length > 0) dados.parameter_values = customParams;

      const res = await api.post('/templates/send-bulk', dados);
      setResultado(res.data);
      setStep(99);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  // ─── Render Parts ──────────────────────────────────────────────────────────

  const renderSteps = () => {
    const steps = modo === 'mensagem' ? [t('Contatos', 'Contacts'), t('Mensagem', 'Message')] : [t('Template', 'Template'), t('Destinatários', 'Audience'), t('Confirmação', 'Confirm')];
    return (
      <div className="flex items-center justify-between mb-10 px-4">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-2 group relative">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm transition-all duration-500 shadow-lg ${step > i + 1 ? 'bg-green-500 text-white scale-90' : step === i + 1 ? 'scale-110 ring-4' : 'opacity-40'}`} style={{ 
                background: step === i + 1 ? colors.primary : step > i + 1 ? colors.green : colors.cardBg,
                color: step === i + 1 ? '#fff' : colors.textPrimary,
                borderColor: colors.border,
                ringColor: `${colors.primary}33`
              }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest transition-all ${step === i + 1 ? 'opacity-100' : 'opacity-40'}`} style={{ color: colors.textPrimary }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-4 rounded-full opacity-10" style={{ background: colors.textPrimary }} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderModeTabs = () => (
    <div className="grid grid-cols-2 gap-4 mb-8">
      <button
        onClick={() => { setModo('mensagem'); setStep(1); setResultado(null); }}
        className={`p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden group ${modo === 'mensagem' ? 'shadow-2xl scale-[1.02]' : 'opacity-60 hover:opacity-100'}`}
        style={{ background: colors.cardBg, borderColor: modo === 'mensagem' ? colors.primary : colors.border }}
      >
        <div className="flex items-center gap-4 mb-2">
          <span className="text-3xl">💬</span>
          <h3 className="font-black text-xs uppercase tracking-widest" style={{ color: modo === 'mensagem' ? colors.primary : colors.textPrimary }}>Mensagem Livre</h3>
        </div>
        <p className="text-[10px] font-medium opacity-60 leading-relaxed" style={{ color: colors.textPrimary }}>Envie para contatos que interagiram nas últimas 24h.</p>
        <div className={`absolute top-0 right-0 w-24 h-24 translate-x-12 translate-y-[-12px] rounded-full blur-3xl transition-opacity duration-1000 ${modo === 'mensagem' ? 'opacity-20' : 'opacity-0'}`} style={{ background: colors.primary }} />
      </button>

      <button
        onClick={() => { setModo('template'); setStep(1); setResultado(null); }}
        className={`p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden group ${modo === 'template' ? 'shadow-2xl scale-[1.02]' : 'opacity-60 hover:opacity-100'}`}
        style={{ background: colors.cardBg, borderColor: modo === 'template' ? colors.primary : colors.border }}
      >
        <div className="flex items-center gap-4 mb-2">
          <span className="text-3xl">📋</span>
          <h3 className="font-black text-xs uppercase tracking-widest" style={{ color: modo === 'template' ? colors.primary : colors.textPrimary }}>Template Meta</h3>
        </div>
        <p className="text-[10px] font-medium opacity-60 leading-relaxed" style={{ color: colors.textPrimary }}>Disparo em massa para qualquer contato (Templates aprovados).</p>
        <div className={`absolute top-0 right-0 w-24 h-24 translate-x-12 translate-y-[-12px] rounded-full blur-3xl transition-opacity duration-1000 ${modo === 'template' ? 'opacity-20' : 'opacity-0'}`} style={{ background: colors.primary }} />
      </button>
    </div>
  );

  // ─── Main Content ─────────────────────────────────────────────────────────

  const renderContent = () => {
    if (step === 99 && resultado) {
      const pct = resultado.total > 0 ? Math.round((resultado.enviados / resultado.total) * 100) : 0;
      return (
        <div className="animate-in fade-in zoom-in-95 duration-500 text-center space-y-10 py-10">
          <div className="relative inline-block">
            <div className="text-7xl mb-4 animate-bounce">{pct >= 90 ? '🎉' : '📤'}</div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">✓</div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Envio Concluído!</h2>
            <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-40" style={{ color: colors.textPrimary }}>Relatório Detalhado</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Total', value: resultado.total, color: colors.primary, icon: '📦' },
              { label: 'Sucesso', value: resultado.enviados, color: colors.green, icon: '✅' },
              { label: 'Falhas', value: resultado.erros, color: colors.red, icon: '❌' },
              { label: 'Fora Janela', value: resultado.fora_janela || 0, color: colors.amber, icon: '⏰' },
            ].map((s, i) => (
              <div key={i} className="p-6 rounded-[2rem] border shadow-xl transition-all hover:scale-105" style={{ background: colors.cardBg, borderColor: colors.border }}>
                <div className="text-xl mb-3 opacity-40">{s.icon}</div>
                <div className="text-3xl font-black mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="max-w-md mx-auto space-y-6 pt-6">
            <div className="h-2 w-full bg-gray-500/10 rounded-full overflow-hidden border border-black/5">
              <div className="h-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setStep(1); setResultado(null); }} className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all" style={{ background: colors.gradientButton }}>Novo Envio</button>
              <button onClick={() => navigate('/empresa/dashboard')} className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest opacity-50 hover:bg-black/5 transition-all" style={{ color: colors.textPrimary }}>Dashboard</button>
            </div>
          </div>
        </div>
      );
    }

    if (modo === 'mensagem') {
      if (step === 1) return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-black text-xs uppercase tracking-widest opacity-50" style={{ color: colors.textPrimary }}>Contatos Ativos (24h)</h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg" style={{ background: `${colors.green}20`, color: colors.green }}>{contatos24h.length}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={recarregarJanela} className="text-[9px] font-black uppercase px-3 py-2 rounded-xl border" style={{ color: colors.textPrimary, borderColor: colors.border, background: colors.cardBg }}>↻ Atualizar</button>
              <button onClick={() => setContatosSelecionados(contatosSelecionados.size === contatos24h.length && contatos24h.length > 0 ? new Set() : new Set(contatos24h.map(c => c.whatsapp_number)))} className="text-[9px] font-black uppercase bg-blue-600/10 text-blue-500 px-4 py-2 rounded-xl border border-blue-500/20">
                {contatosSelecionados.size === contatos24h.length && contatos24h.length > 0 ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>
            </div>
          </div>
          {contatos24h.length === 0 && (
            <div className="text-center py-12 opacity-40" style={{ color: colors.textPrimary }}>
              <div className="text-4xl mb-3">⏳</div>
              <p className="text-xs font-black uppercase tracking-widest">Nenhum contato na janela de 24h</p>
              <p className="text-[10px] mt-1">Quando um cliente te mandar mensagem, ele aparece aqui</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto no-scrollbar p-1">
            {contatos24h.map(c => (
              <div 
                key={c.whatsapp_number} 
                onClick={() => toggleContato(c.whatsapp_number)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 hover:shadow-xl ${contatosSelecionados.has(c.whatsapp_number) ? 'ring-2' : ''}`}
                style={{ 
                  background: contatosSelecionados.has(c.whatsapp_number) ? `${colors.primary}15` : colors.cardBg, 
                  borderColor: contatosSelecionados.has(c.whatsapp_number) ? colors.primary : colors.border 
                }}
              >
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center text-white transition-all ${contatosSelecionados.has(c.whatsapp_number) ? 'bg-blue-500 border-blue-500 scale-110' : 'border-black/10'}`}>
                  {contatosSelecionados.has(c.whatsapp_number) && '✓'}
                </div>
                <div className="flex-1">
                  <div className="font-black text-xs uppercase truncate" style={{ color: colors.textPrimary }}>{c.nome || c.whatsapp_number}</div>
                  <div className="text-[10px] font-bold opacity-40" style={{ color: colors.textPrimary }}>{c.whatsapp_number}</div>
                </div>
                <div className="text-[9px] font-black px-2 py-1 rounded-lg bg-black/5" style={{ color: c.minutos_restantes < 120 ? colors.amber : colors.green }}>
                  {Math.floor(c.minutos_restantes / 60)}h{c.minutos_restantes % 60}m
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-6">
            <button 
              onClick={() => setStep(2)} 
              disabled={contatosSelecionados.size === 0}
              className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
              style={{ background: colors.gradientButton }}
            >
              Próximo Passo →
            </button>
          </div>
        </div>
      );

      if (step === 2) {
        const tiposMsg = [
          { id: 'text', icon: '💬', label: 'Texto' },
          { id: 'image', icon: '🖼️', label: 'Imagem' },
          { id: 'button', icon: '🔘', label: 'Botões' },
          { id: 'list', icon: '📋', label: 'Lista' },
        ] as const;

        const botoesFiltrados = msgBotoes.filter(b => b.title.trim());
        const podeEnviar = mensagemTexto.trim() &&
          (tipoMensagem !== 'button' || botoesFiltrados.length > 0) &&
          (tipoMensagem !== 'list' || msgListaSecoes.some(s => s.rows.some(r => r.title.trim())));

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-right-4 duration-500">
            <div className="lg:col-span-7 space-y-6">

              {/* Seletor de tipo */}
              <div className="grid grid-cols-4 gap-2 p-1.5 rounded-2xl" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' }}>
                {tiposMsg.map(t => (
                  <button key={t.id} onClick={() => setTipoMensagem(t.id)} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1 ${tipoMensagem === t.id ? 'shadow-xl text-white scale-105' : 'opacity-40'}`} style={{ background: tipoMensagem === t.id ? colors.primary : 'transparent' }}>
                    <span className="text-base">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              <section className="rounded-[2.5rem] shadow-2xl border p-8 space-y-5" style={{ background: colors.cardBg, borderColor: colors.border }}>

                {/* Texto do body (todos os tipos) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>
                      {tipoMensagem === 'image' ? 'Legenda da Imagem' : 'Corpo da Mensagem'}
                    </label>
                    <button onClick={() => setShowEmoji(v => !v)} className="text-lg hover:scale-110 transition-transform" title="Emojis">😊</button>
                  </div>
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={mensagemTexto}
                      onChange={e => setMensagemTexto(e.target.value)}
                      rows={tipoMensagem === 'text' ? 8 : 4}
                      className="w-full p-5 rounded-[1.5rem] outline-none border transition-all leading-relaxed"
                      style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }}
                      placeholder={tipoMensagem === 'image' ? 'Legenda opcional da imagem...' : 'Texto principal da mensagem...'}
                    />
                    {showEmoji && (
                      <div className="absolute right-0 top-full mt-2 z-50 shadow-2xl rounded-2xl overflow-hidden">
                        <EmojiPicker
                          theme={theme === 'yoursystem' ? Theme.DARK : Theme.LIGHT}
                          onEmojiClick={(emojiData: EmojiClickData) => {
                            const ta = textareaRef.current;
                            if (ta) {
                              const start = ta.selectionStart ?? mensagemTexto.length;
                              const end = ta.selectionEnd ?? mensagemTexto.length;
                              const next = mensagemTexto.slice(0, start) + emojiData.emoji + mensagemTexto.slice(end);
                              setMensagemTexto(next);
                              setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length); }, 10);
                            } else {
                              setMensagemTexto(v => v + emojiData.emoji);
                            }
                            setShowEmoji(false);
                          }}
                          lazyLoadEmojis
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-black uppercase opacity-30" style={{ color: colors.textPrimary }}>{mensagemTexto.length} caracteres</span>
                    <p className="text-[9px] font-black uppercase text-blue-500 tracking-tighter">Janela de 24h ativa ✓</p>
                  </div>
                </div>

                {/* IMAGEM */}
                {tipoMensagem === 'image' && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Imagem</label>
                    <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadImagem(e.target.files[0], 'main')} />
                    {msgImgUrl ? (
                      <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: colors.border }}>
                        <img src={msgImgUrl} alt="preview" className="w-full h-36 object-cover" />
                        <button onClick={() => { setMsgImgUrl(''); if (imgInputRef.current) imgInputRef.current.value = ''; }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => imgInputRef.current?.click()} disabled={uploadingImg === 'main'} className="w-full py-8 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-40" style={{ borderColor: `${colors.primary}44` }}>
                        <span className="text-3xl">{uploadingImg === 'main' ? '⏳' : '📷'}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.primary }}>{uploadingImg === 'main' ? 'Enviando...' : 'Clique para selecionar imagem'}</span>
                        <span className="text-[9px] opacity-40" style={{ color: colors.textPrimary }}>JPG, PNG, WebP — máx. 5MB</span>
                      </button>
                    )}
                  </div>
                )}

                {/* BOTÕES */}
                {tipoMensagem === 'button' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Cabeçalho (opcional)</label>
                        <input value={msgHeader} onChange={e => setMsgHeader(e.target.value)} className="w-full px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Título acima..." />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Rodapé (opcional)</label>
                        <input value={msgFooter} onChange={e => setMsgFooter(e.target.value)} className="w-full px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Texto abaixo..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Imagem no cabeçalho (opcional, substitui texto)</label>
                      <input ref={headerImgInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadImagem(e.target.files[0], 'header')} />
                      {msgHeaderImgUrl ? (
                        <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: colors.border }}>
                          <img src={msgHeaderImgUrl} alt="header" className="w-full h-24 object-cover" />
                          <button onClick={() => { setMsgHeaderImgUrl(''); if (headerImgInputRef.current) headerImgInputRef.current.value = ''; }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => headerImgInputRef.current?.click()} disabled={uploadingImg === 'header'} className="w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 hover:opacity-80 transition-opacity disabled:opacity-40" style={{ borderColor: `${colors.primary}44` }}>
                          <span className="text-xl">{uploadingImg === 'header' ? '⏳' : '🖼️'}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.primary }}>{uploadingImg === 'header' ? 'Enviando...' : 'Upload de imagem para o cabeçalho'}</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Botões (máx. 3)</label>
                      {msgBotoes.slice(0, 3).map((btn, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <span className="text-[10px] font-black opacity-30 w-4" style={{ color: colors.textPrimary }}>{i + 1}</span>
                          <input value={btn.title} onChange={e => { const nb = [...msgBotoes]; nb[i] = { title: e.target.value }; setMsgBotoes(nb); }} className="flex-1 px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder={`Texto do botão ${i + 1}...`} maxLength={20} />
                          <span className="text-[9px] opacity-20" style={{ color: colors.textPrimary }}>{btn.title.length}/20</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LISTA */}
                {tipoMensagem === 'list' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Cabeçalho (opcional)</label>
                        <input value={msgHeader} onChange={e => setMsgHeader(e.target.value)} className="w-full px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Título acima..." />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Texto do botão lista</label>
                        <input value={msgListaBtnText} onChange={e => setMsgListaBtnText(e.target.value)} className="w-full px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Ver opções" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Rodapé (opcional)</label>
                      <input value={msgFooter} onChange={e => setMsgFooter(e.target.value)} className="w-full px-4 py-3 rounded-2xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Texto abaixo..." />
                    </div>
                    {msgListaSecoes.map((secao, si) => (
                      <div key={si} className="border rounded-2xl p-4 space-y-3" style={{ borderColor: colors.border }}>
                        <input value={secao.title} onChange={e => { const ns = [...msgListaSecoes]; ns[si] = { ...ns[si], title: e.target.value }; setMsgListaSecoes(ns); }} className="w-full px-4 py-2 rounded-xl border outline-none text-xs font-bold" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Nome da seção..." />
                        {secao.rows.map((row, ri) => (
                          <div key={ri} className="flex gap-2">
                            <input value={row.title} onChange={e => { const ns = [...msgListaSecoes]; ns[si].rows[ri] = { ...ns[si].rows[ri], title: e.target.value }; setMsgListaSecoes(ns); }} className="flex-1 px-3 py-2 rounded-xl border outline-none text-xs" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder={`Item ${ri + 1}...`} />
                            <input value={row.description} onChange={e => { const ns = [...msgListaSecoes]; ns[si].rows[ri] = { ...ns[si].rows[ri], description: e.target.value }; setMsgListaSecoes(ns); }} className="flex-1 px-3 py-2 rounded-xl border outline-none text-xs opacity-60" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="Descrição (opcional)..." />
                          </div>
                        ))}
                        <button onClick={() => { const ns = [...msgListaSecoes]; ns[si].rows.push({ id: `row_${Date.now()}`, title: '', description: '' }); setMsgListaSecoes(ns); }} className="text-[9px] font-black uppercase opacity-40 hover:opacity-70 transition-opacity" style={{ color: colors.primary }}>+ Adicionar item</button>
                      </div>
                    ))}
                  </div>
                )}

              </section>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest opacity-50 hover:bg-black/5 transition-all" style={{ color: colors.textPrimary }}>← Voltar</button>
                <button onClick={enviarMensagem} disabled={enviando || !podeEnviar} className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30" style={{ background: colors.gradientButton }}>
                  {enviando ? 'Enviando...' : `Disparar para ${contatosSelecionados.size} Contatos`}
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="lg:col-span-5">
              <div className="sticky top-10">
                {tipoMensagem === 'text' && <MessagePreview body={mensagemTexto} />}
                {tipoMensagem === 'image' && <MessagePreview body={mensagemTexto} headerUrl={msgImgUrl} />}
                {tipoMensagem === 'button' && (
                  <MessagePreview
                    body={mensagemTexto}
                    header={msgHeaderImgUrl ? undefined : msgHeader}
                    headerUrl={msgHeaderImgUrl || undefined}
                    footer={msgFooter}
                    buttons={msgBotoes.filter(b => b.title.trim()).map(b => b.title)}
                  />
                )}
                {tipoMensagem === 'list' && (
                  <MessagePreview
                    body={mensagemTexto}
                    header={msgHeader}
                    footer={msgFooter}
                    buttons={[msgListaBtnText || 'Ver opções']}
                  />
                )}
              </div>
            </div>
          </div>
        );
      }
    }

    if (modo === 'template') {
      if (step === 1) return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tpl => (
              <div 
                key={tpl.id}
                onClick={() => setTemplateSelecionado(tpl)}
                className={`p-6 rounded-[2rem] border cursor-pointer transition-all duration-500 group relative overflow-hidden hover:shadow-2xl ${templateSelecionado?.id === tpl.id ? 'ring-4 scale-[1.02]' : 'opacity-70'}`}
                style={{ 
                  background: templateSelecionado?.id === tpl.id ? `${colors.primary}10` : colors.cardBg, 
                  borderColor: templateSelecionado?.id === tpl.id ? colors.primary : colors.border,
                  ringColor: `${colors.primary}33`
                }}
              >
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-black text-xs uppercase tracking-tighter line-clamp-1" style={{ color: colors.textPrimary }}>{tpl.name}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${tpl.category === 'MARKETING' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>{tpl.category}</span>
                </div>
                <p className="text-[10px] font-medium opacity-40 line-clamp-3 leading-relaxed" style={{ color: colors.textPrimary }}>{tpl.components.find(c => c.type === 'BODY')?.text || 'Carrossel Interativo'}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={!templateSelecionado} className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 transition-all disabled:opacity-30" style={{ background: colors.gradientButton }}>Próximo Passo →</button>
          </div>
        </div>
      );

      if (step === 2) {
        const contatosFiltrados = contatosSistema.filter(c => {
          if (filtro24hTpl && !c.na_janela_24h) return false;
          if (buscaContato) return (c.nome || c.whatsapp_number).toLowerCase().includes(buscaContato.toLowerCase());
          return true;
        });
        const podeAvancar = fonteContato === 'contatos'
          ? contatosSelecionadosTpl.size > 0
          : numerosTexto.trim().length > 0;

        return (
          <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-2 gap-3 p-1.5 rounded-3xl" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' }}>
              {(['contatos', 'numeros'] as const).map(m => (
                <button key={m} onClick={() => setFonteContato(m)} className={`py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${fonteContato === m ? 'shadow-xl scale-105 text-white' : 'opacity-40'}`} style={{ background: fonteContato === m ? colors.primary : 'transparent' }}>
                  {m === 'contatos' ? '👥 Contatos' : '✏️ Números'}
                </button>
              ))}
            </div>

            {fonteContato === 'contatos' && (
              <div className="space-y-4">
                <div className="flex gap-3 items-center">
                  <input value={buscaContato} onChange={e => setBuscaContato(e.target.value)} placeholder="Buscar contato..." className="flex-1 px-4 py-3 rounded-2xl border outline-none text-xs font-medium shadow-inner" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} />
                  <button
                    onClick={() => setFiltro24hTpl(!filtro24hTpl)}
                    className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase border transition-all ${filtro24hTpl ? 'text-green-400 border-green-400/40 bg-green-500/10' : 'opacity-50'}`}
                    style={{ color: filtro24hTpl ? undefined : colors.textPrimary, borderColor: filtro24hTpl ? undefined : colors.border }}
                  >
                    ⏱ Janela 24h
                  </button>
                  <button onClick={() => setContatosSelecionadosTpl(contatosSelecionadosTpl.size === contatosFiltrados.length ? new Set() : new Set(contatosFiltrados.map(c => c.whatsapp_number)))} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase bg-blue-600/10 text-blue-500 border border-blue-500/20">
                    {contatosSelecionadosTpl.size === contatosFiltrados.length ? 'Limpar' : 'Todos'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto no-scrollbar p-1">
                  {contatosFiltrados.map(c => (
                    <div
                      key={c.whatsapp_number}
                      onClick={() => {
                        const next = new Set(contatosSelecionadosTpl);
                        next.has(c.whatsapp_number) ? next.delete(c.whatsapp_number) : next.add(c.whatsapp_number);
                        setContatosSelecionadosTpl(next);
                      }}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 hover:shadow-xl ${contatosSelecionadosTpl.has(c.whatsapp_number) ? 'ring-2' : ''}`}
                      style={{ background: contatosSelecionadosTpl.has(c.whatsapp_number) ? `${colors.primary}15` : colors.cardBg, borderColor: contatosSelecionadosTpl.has(c.whatsapp_number) ? colors.primary : colors.border }}
                    >
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center text-white transition-all ${contatosSelecionadosTpl.has(c.whatsapp_number) ? 'bg-blue-500 border-blue-500 scale-110' : 'border-black/10'}`}>
                        {contatosSelecionadosTpl.has(c.whatsapp_number) && '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-xs truncate" style={{ color: colors.textPrimary }}>{c.nome || c.whatsapp_number}</div>
                        <div className="text-[10px] opacity-40 truncate" style={{ color: colors.textPrimary }}>{c.whatsapp_number}</div>
                      </div>
                      {c.na_janela_24h && <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-green-500/10 text-green-400">24h</span>}
                    </div>
                  ))}
                  {contatosFiltrados.length === 0 && <p className="col-span-2 text-center opacity-40 text-xs py-8" style={{ color: colors.textPrimary }}>Nenhum contato encontrado</p>}
                </div>
                {contatosSelecionadosTpl.size > 0 && (
                  <p className="text-[10px] font-black text-center opacity-60" style={{ color: colors.primary }}>{contatosSelecionadosTpl.size} contato{contatosSelecionadosTpl.size > 1 ? 's' : ''} selecionado{contatosSelecionadosTpl.size > 1 ? 's' : ''}</p>
                )}
              </div>
            )}

            {fonteContato === 'numeros' && (
              <section className="rounded-[2.5rem] shadow-2xl border p-8 space-y-4" style={{ background: colors.cardBg, borderColor: colors.border }}>
                <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 text-center" style={{ color: colors.textPrimary }}>Insira os números (Um por linha)</label>
                <textarea value={numerosTexto} onChange={e => setNumerosTexto(e.target.value)} rows={8} className="w-full p-6 rounded-[2rem] outline-none border font-mono text-center text-sm shadow-inner" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} placeholder="5511999999999" />
              </section>
            )}

            <div className="flex justify-between pt-6">
              <button onClick={() => setStep(1)} className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest opacity-50" style={{ color: colors.textPrimary }}>← Voltar</button>
              <button onClick={() => setStep(3)} disabled={!podeAvancar} className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30" style={{ background: colors.gradientButton }}>Personalizar Mensagem →</button>
            </div>
          </div>
        );
      }

      if (step === 3) {
        const preview = getTemplatePreviewData();
        const params = getTemplateParams();
        const isCarousel = templateSelecionado?.category === 'INTERACTIVE_CAROUSEL';
        const carouselComp = templateSelecionado?.components?.find((c: any) => c.type?.toUpperCase() === 'CAROUSEL');
        const carouselCardsData = carouselComp?.example?.cards || [];

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-right-4 duration-500">
            <div className="lg:col-span-7 space-y-6">
              <section className="rounded-[2.5rem] shadow-2xl border p-8 space-y-8" style={{ background: colors.cardBg, borderColor: colors.border }}>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-black/5">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={useContactName} onChange={e => setUseContactName(e.target.checked)} className="w-5 h-5 rounded" />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>Usar nome do contato</span>
                  </div>
                  {useContactName && <input value={fallbackName} onChange={e => setFallbackName(e.target.value)} placeholder="Fallback..." className="px-4 py-2 rounded-xl border text-[10px] font-black outline-none w-32" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} />}
                </div>

                {params.length > 1 && (
                  <div className="space-y-4 pt-4 border-t" style={{ borderColor: colors.border }}>
                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40" style={{ color: colors.textPrimary }}>Variáveis Adicionais</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {params.filter(p => p !== '1').map(p => (
                        <div key={p}>
                          <label className="block text-[10px] font-black mb-2" style={{ color: colors.textPrimary }}>Variável {"{{" + p + "}}"}</label>
                          <input value={customParams[p] || ''} onChange={e => setCustomParams({ ...customParams, [p]: e.target.value })} className="w-full px-4 py-3 rounded-xl border text-xs outline-none" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-6 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center text-center gap-3" style={{ borderColor: `${colors.primary}33`, background: `${colors.primary}05` }}>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Resumo do Disparo</div>
                  <div className="text-4xl font-black" style={{ color: colors.primary }}>
                    {fonteContato === 'contatos'
                      ? contatosSelecionadosTpl.size
                      : numerosTexto.split('\n').filter((n: string) => n.trim().length >= 10).length} Destinatários
                  </div>
                  <div className="text-[9px] font-black uppercase px-3 py-1 rounded-lg bg-black/5 opacity-60" style={{ color: colors.textPrimary }}>Processamento via Celery Queue</div>
                </div>
              </section>

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest opacity-50" style={{ color: colors.textPrimary }}>← Voltar</button>
                <button onClick={enviarTemplate} disabled={enviando} className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all" style={{ background: colors.gradientButton }}>{enviando ? 'Iniciando Disparo...' : 'Confirmar e Iniciar Disparo'}</button>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="sticky top-10">
                <MessagePreview
                  header={preview.header}
                  headerUrl={preview.headerUrl}
                  body={params.reduce((text: string, param: string) => {
                    if (param === '1') return text.replace(/\{\{1\}\}/g, useContactName ? (fallbackName || 'Nome') : '{{1}}');
                    return text.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), customParams[param] || `{{${param}}}`);
                  }, preview.body)}
                  footer={preview.footer}
                  buttons={preview.buttons}
                  isCarousel={isCarousel}
                  carouselCards={carouselCardsData}
                />
              </div>
            </div>
          </div>
        );
      }
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center font-black uppercase tracking-widest" style={{ background: colors.dashboardBg, color: colors.primary }}>
      <div className="animate-pulse">Iniciando Motor de Disparo...</div>
    </div>
  );

  return (
    <div className="flex flex-col transition-all duration-500 overflow-hidden" style={{ background: colors.dashboardBg, height: '100vh' }}>
      {/* Background Orbs para Tema Dark */}
      {theme === 'yoursystem' && (
        <>
          <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-20 blur-[120px] pointer-events-none" style={{ background: colors.primary }} />
          <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-10 blur-[100px] pointer-events-none" style={{ background: '#8b5cf6' }} />
        </>
      )}

      {/* Header Premium */}
      <header className="h-20 border-b px-8 flex items-center justify-between sticky top-0 z-50 backdrop-blur-xl transition-all duration-500" style={{ background: `${colors.cardBg}cc`, borderColor: colors.border }}>
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-3 rounded-2xl hover:bg-black/5 transition-all text-xl" style={{ color: colors.textPrimary }}>←</button>
          <div className="h-8 w-[1px] opacity-10" style={{ background: colors.textPrimary }} />
          <div>
            <h1 className="text-lg font-black uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>Envio em <span style={{ color: colors.primary }}>Massa</span></h1>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-40" style={{ color: colors.textPrimary }}>Intelligent Bulk Messaging Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button onClick={() => navigate('/empresa/dashboard')} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/30 text-blue-500 hover:scale-105 transition-all shadow-lg">Dashboard</button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10" style={{ background: colors.dashboardBg }}>
        <div className="max-w-5xl mx-auto p-8 lg:p-12">
          {step !== 99 && renderSteps()}
          {step !== 99 && renderModeTabs()}
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default EnvioMassaPage;
