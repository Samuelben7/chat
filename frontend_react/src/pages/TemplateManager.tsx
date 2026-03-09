import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage, LangToggle } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import { templatesApi, catalogoApi } from '../services/api';
import { MessageTemplate, TemplateComponent, TemplateButton, TemplateType, CarouselCard, CarouselQuickReply } from '../types';
import whatsappBg from '../images/PLANO-DE-FUNDO-WHATS-APP.png';

// ==================== UTILITÁRIO DE URL (CONECTADO AO FASTAPI) ====================
const getFullUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;

  // Usa URL.origin para extrair apenas o domínio base (evita split incorreto em subdomínios como api.xxx)
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
  let baseUrl = 'http://localhost:8000';
  try {
    baseUrl = new URL(apiUrl).origin;
  } catch { /* fallback ao default */ }

  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${baseUrl}${cleanPath}`;
};

// ==================== CHAT PREVIEW COMPONENT (ESTILO IPHONE) ====================

const TemplateChatPreview: React.FC<{
  components: TemplateComponent[];
  name: string;
  headerImageUrl?: string;
  templateType?: TemplateType;
  couponCode?: string;
  limitedOfferText?: string;
  limitedOfferExpiration?: string;
  paramExamples?: Record<string, string>;
  carouselCards?: CarouselCard[];
}> = ({ components, name, headerImageUrl, templateType, couponCode, limitedOfferText, limitedOfferExpiration, paramExamples, carouselCards }) => {
  const { colors, theme } = useTheme();
  const { t } = useLanguage();
  
  const header = components.find(c => c.type === 'HEADER');
  const body = components.find(c => c.type === 'BODY');
  const footer = components.find(c => c.type === 'FOOTER');
  const buttons = components.find(c => c.type === 'BUTTONS');
  const lto = components.find(c => c.type === 'LIMITED_TIME_OFFER');

  const bubbleBg = theme === 'whatsapp' ? (theme === 'dark' ? '#1B272E' : '#FFFFFF') : colors.cardBg;
  const bubbleText = theme === 'whatsapp' ? (theme === 'dark' ? '#E9EDEF' : '#111B21') : colors.textPrimary;
  const secondaryText = theme === 'whatsapp' ? (theme === 'dark' ? '#8696A0' : '#667781') : colors.textSecondary;

  const highlightParams = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{\{\d+\}\}|\{\{[a-zA-Z_]+\}\})/g);
    return parts.map((part, i) => {
      if (/\{\{.+?\}\}/.test(part)) {
        const paramKey = part.replace(/[{}]/g, '');
        const filledValue = paramExamples?.[paramKey];
        return (
          <span key={i} className="px-1 rounded font-bold" style={{ background: `${colors.primary}33`, color: colors.primary }}>
            {filledValue || part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex justify-center items-center py-6 rounded-[3rem] border transition-all duration-700 shadow-[0_20px_50px_rgba(0,0,0,0.2)]" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.02)', borderColor: colors.border }}>
      {/* FRAME DO IPHONE REALISTA */}
      <div className="relative w-[300px] h-[610px] bg-[#000] rounded-[3.5rem] border-[10px] border-[#1a1a1a] shadow-2xl overflow-hidden scale-95 origin-top ring-2 ring-white/5">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-[#1a1a1a] rounded-b-3xl z-50 flex items-center justify-center gap-2">
           <div className="w-12 h-1.5 bg-white/10 rounded-full" />
           <div className="w-2 h-2 rounded-full bg-white/10" />
        </div>
        
        {/* WhatsApp Header Mockup */}
        <div className="absolute top-0 w-full h-24 flex items-end p-4 z-30 shadow-md" style={{ background: theme === 'whatsapp' ? (theme === 'dark' ? '#202C33' : '#075E54') : colors.sidebarBg }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white text-[10px] border border-white/20 font-black shadow-lg">WA</div>
            <div className="flex flex-col">
              <span className="text-white text-[12px] font-black uppercase tracking-tight">WhatsApp Business</span>
              <span className="text-white/60 text-[9px] font-bold flex items-center gap-1">online <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /></span>
            </div>
          </div>
        </div>

        <div className="w-full h-full pt-24 pb-12 px-3 flex flex-col justify-start overflow-hidden relative" style={{ backgroundImage: `url(${whatsappBg})`, backgroundSize: 'cover', backgroundBlendMode: theme === 'dark' ? 'multiply' : 'normal', backgroundColor: theme === 'dark' ? '#0B141A' : 'transparent' }}>
          
          <div className="flex flex-col items-start w-full mt-4 space-y-3 relative z-10 no-scrollbar overflow-y-auto max-h-full pb-10">
            
            {/* BALÃO DE TEXTO */}
            <div className="w-[94%] relative animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="shadow-2xl p-0 overflow-hidden border border-black/5" style={{ background: bubbleBg, borderRadius: '0 18px 18px 18px' }}>
                
                {/* Header Media */}
                {templateType !== 'carousel' && header && header.format !== 'TEXT' && (
                  <div className="aspect-video bg-black/10 flex items-center justify-center overflow-hidden border-b border-black/5 relative group">
                    {headerImageUrl ? (
                      <img src={getFullUrl(headerImageUrl)} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="header" />
                    ) : (
                      <div className="flex flex-col items-center opacity-20">
                         <span className="text-4xl">📷</span>
                         <span className="text-[8px] font-black uppercase mt-1">Mídia do Header</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 space-y-2">
                  {/* Header Text */}
                  {templateType !== 'carousel' && header?.format === 'TEXT' && (
                    <p className="text-[14px] font-black leading-tight uppercase tracking-tight" style={{ color: colors.primary }}>
                      {highlightParams(header.text || '')}
                    </p>
                  )}
                  
                  {/* Body Text */}
                  <p className="text-[13.5px] leading-[1.5] font-medium" style={{ color: bubbleText }}>
                    {highlightParams(body?.text || (templateType === 'carousel' ? (formBody || 'Confira nossas ofertas:') : ''))}
                  </p>

                  {/* Coupon UI */}
                  {templateType === 'coupon' && couponCode && (
                    <div className="mt-4 p-3 rounded-xl border-2 border-dashed border-blue-500/30 bg-blue-500/5 flex flex-col items-center gap-2">
                       <span className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: bubbleText }}>Código do Cupom</span>
                       <span className="text-lg font-black tracking-[0.3em] text-blue-500">{couponCode}</span>
                       <button className="text-[9px] font-black uppercase bg-blue-500 text-white px-4 py-1.5 rounded-full shadow-md">Copiar Código</button>
                    </div>
                  )}

                  {/* LTO UI */}
                  {templateType === 'limited_time_offer' && ltoText && (
                    <div className="mt-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col gap-1">
                       <div className="flex items-center gap-2">
                          <span className="text-lg">⏳</span>
                          <span className="text-[11px] font-black uppercase text-orange-600">{ltoText}</span>
                       </div>
                       {limitedOfferExpiration && (
                         <span className="text-[9px] font-bold opacity-60" style={{ color: bubbleText }}>Expira em: {new Date(limitedOfferExpiration).toLocaleString()}</span>
                       )}
                    </div>
                  )}

                  {/* Footer Text */}
                  {footer && (
                    <p className="text-[11px] mt-2 opacity-60 font-medium" style={{ color: secondaryText }}>
                      {footer.text}
                    </p>
                  )}

                  {/* Time & Read Receipts */}
                  <div className="flex justify-end items-center gap-1 mt-1">
                    <span className="text-[10px] opacity-50" style={{ color: secondaryText }}>12:45</span>
                    <span className="text-[14px] leading-none" style={{ color: '#53bdeb' }}>✓✓</span>
                  </div>
                </div>

                {/* Buttons (Standard) */}
                {templateType !== 'carousel' && buttons?.buttons && buttons.buttons.length > 0 && (
                  <div className="flex flex-col border-t divide-y" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                    {buttons.buttons.map((btn, i) => (
                      <button key={i} className="w-full py-3.5 text-[13px] font-black uppercase tracking-tight flex items-center justify-center gap-2 hover:bg-black/5 transition-colors" style={{ color: colors.primary }}>
                        {btn.type === 'PHONE_NUMBER' && <span>📞</span>}
                        {btn.type === 'URL' && <span>🔗</span>}
                        {btn.type === 'QUICK_REPLY' && <span>↩️</span>}
                        {btn.text || 'Botão'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Tail do Balão */}
              <div className="absolute top-0 -left-2 w-3 h-3 transition-all" style={{ backgroundColor: bubbleBg, clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
            </div>

            {/* CARDS DO CARROSSEL */}
            {templateType === 'carousel' && carouselCards && carouselCards.length > 0 && (
              <div className="flex gap-3 overflow-x-auto w-full no-scrollbar px-1 py-4 snap-x pl-1">
                {carouselCards.map((card, idx) => (
                  <div key={idx} className="snap-start flex-shrink-0 w-48 rounded-[1.5rem] overflow-hidden shadow-2xl border border-black/5 transition-transform duration-500 hover:scale-[1.02]" style={{ background: bubbleBg }}>
                    <div
                      className="h-32 overflow-hidden relative flex items-center justify-center"
                      style={{
                        backgroundImage: card.headerUrl ? `url(${getFullUrl(card.headerUrl)})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundColor: card.headerUrl ? 'transparent' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      {!card.headerUrl && (
                        <div className="flex flex-col items-center opacity-70">
                          <span className="text-4xl">🖼️</span>
                          <span className="text-[8px] font-black uppercase mt-1">Card {idx + 1}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full text-[8px] text-white font-black uppercase tracking-widest">{idx + 1} / {carouselCards.length}</div>
                    </div>
                    
                    <div className="p-4 min-h-[90px] flex flex-col justify-between">
                      <p className="text-[12px] leading-tight line-clamp-3 font-medium mb-3" style={{ color: bubbleText }}>
                        {card.bodyText || 'Clique para adicionar uma descrição sofisticada para este item do seu carrossel...'}
                      </p>
                      
                      <button className="w-full py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all hover:bg-black/5 active:scale-95 flex items-center justify-center gap-2" style={{ color: colors.primary, borderColor: `${colors.primary}33` }}>
                         {card.buttonUrl ? '🔗' : '↩️'} {card.buttonDisplayText || 'Ver Detalhes'}
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

// ==================== AUXILIARES ====================

// ==================== AUXILIARES DE VALIDAÇÃO (META STANDARDS) ====================

const validateTemplateName = (name: string) => /^[a-z0-9_]+$/.test(name) && name.length <= 512;
const MAX_BODY = 1024;
const MAX_HEADER_TEXT = 60;
const MAX_FOOTER = 60;
const MAX_BUTTON_TEXT = 25;
const MAX_COUPON_CODE = 20;

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useLanguage();
  const config = {
    APPROVED: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', label: t('Aprovado', 'Approved') },
    SAVED: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20', label: t('Salvo', 'Saved') },
    PENDING: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20', label: t('Pendente', 'Pending'), pulse: true },
    REJECTED: { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20', label: t('Rejeitado', 'Rejected') },
    DELETED: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', label: t('Excluído', 'Deleted') },
  }[status] || { bg: 'bg-slate-500/10', text: 'text-slate-500', border: 'border-slate-500/20', label: status };
  
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 border ${config.bg} ${config.text} ${config.border} shadow-sm transition-all hover:scale-105`}>
      {config.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shadow-[0_0_8px_currentColor]" />}
      {config.label}
    </span>
  );
};

// ==================== MAIN COMPONENT ====================

const TemplateManager: React.FC = () => {
  const { colors, theme } = useTheme();
  const { t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Data
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  // Form State
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('MARKETING');
  const [formLanguage, setFormLanguage] = useState('pt_BR');
  const [templateType, setTemplateType] = useState<TemplateType>('standard');
  const [formHeaderType, setFormHeaderType] = useState('none');
  const [formHeaderText, setFormHeaderText] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formFooter, setFormFooter] = useState('');
  const [formButtons, setFormButtons] = useState<TemplateButton[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [ltoText, setLtoText] = useState('');
  const [ltoHasExpiration, setLtoHasExpiration] = useState(false);
  const [ltoExpiration, setLtoExpiration] = useState('');
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [headerHandle, setHeaderHandle] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paramExamples, setParamExamples] = useState<Record<string, string>>({});

  // Carousel State
  const defaultCard = (idx: number): CarouselCard => ({
    cardIndex: idx, 
    headerType: 'image', 
    headerUrl: '', 
    bodyText: '',
    buttonDisplayText: 'Ver mais', 
    buttonUrl: '', 
    quickReplies: [],
  });
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([defaultCard(0), defaultCard(1)]);
  const [uploadingCardIndex, setUploadingCardIndex] = useState<number | null>(null);
  const pendingCardUploadIndexRef = useRef<number | null>(null);
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modais
  const [sendModal, setSendModal] = useState(false);
  const [sendNumber, setSendNumber] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { carregarTemplates(); }, [page, filterCategory, filterStatus, searchQuery]);

  const carregarTemplates = async () => {
    try {
      setLoading(true);
      const res = await templatesApi.listar({ 
        page, 
        per_page: 20, 
        status: filterStatus || undefined, 
        category: filterCategory || undefined, 
        search: searchQuery || undefined 
      });
      setTemplates(res.templates); 
      setTotalTemplates(res.total);
    } catch (e) { 
      console.error('Erro ao carregar templates:', e); 
    } finally { 
      setLoading(false); 
    }
  };

  const resetForm = () => {
    setFormMode('create'); 
    setSelectedTemplate(null); 
    setFormName(''); 
    setTemplateType('standard'); 
    setFormHeaderType('none'); 
    setFormHeaderText('');
    setFormBody(''); 
    setFormFooter(''); 
    setFormButtons([]); 
    setCouponCode(''); 
    setLtoText(''); 
    setLtoHasExpiration(false); 
    setLtoExpiration('');
    setCarouselCards([defaultCard(0), defaultCard(1)]); 
    setHeaderImageUrl(''); 
    setHeaderHandle('');
    setParamExamples({});
  };

  const loadTemplateIntoForm = (tmpl: MessageTemplate) => {
    setSelectedTemplate(tmpl); 
    setFormMode('edit'); 
    setFormName(tmpl.name); 
    setFormCategory(tmpl.category); 
    setFormLanguage(tmpl.language);
    
    // Header Recovery
    const h = tmpl.components?.find(c => c.type === 'HEADER');
    setFormHeaderType(h?.format?.toLowerCase() || 'none'); 
    setFormHeaderText(h?.text || '');
    if (h?.format === 'IMAGE') {
      // Preferir imagem local salva; fallback para CDN handle da Meta
      const localOrCdn = tmpl.header_image_path || h.example?.header_handle?.[0] || '';
      setHeaderImageUrl(localOrCdn);
      if (h.example?.header_handle?.[0]) setHeaderHandle(h.example.header_handle[0]);
    }
    
    // Body Recovery
    const bodyComp = tmpl.components?.find(c => c.type === 'BODY');
    setFormBody(bodyComp?.text || '');
    
    // Footer & Buttons
    setFormFooter(tmpl.components?.find(c => c.type === 'FOOTER')?.text || '');
    setFormButtons(tmpl.components?.find(c => c.type === 'BUTTONS')?.buttons || []);
    
    // Recovery for specialized types
    const isCarousel = tmpl.category === 'INTERACTIVE_CAROUSEL' || tmpl.components?.some(c => c.type === 'CAROUSEL');
    if (isCarousel) {
      setTemplateType('carousel');
      const carouselComp = tmpl.components?.find(c => c.type === 'CAROUSEL');
      const cardsToMap = carouselComp?.example?.cards || [];
      
      if (cardsToMap.length > 0) {
        setCarouselCards(cardsToMap.map((card: any, idx: number) => ({
          cardIndex: idx,
          headerType: card.header?.type?.toLowerCase() || 'image',
          headerUrl: card.header?.image?.link || '',
          headerHandle: card.header?.image?.example?.header_handle?.[0] || '',
          bodyText: card.body?.text || '',
          buttonDisplayText: card.action?.buttons?.[0]?.text || 'Ver mais',
          buttonUrl: card.action?.buttons?.[0]?.url || '',
        })));
      }
    } else {
      const lto = tmpl.components?.find(c => c.type === 'LIMITED_TIME_OFFER');
      const coupon = tmpl.components?.find(c => c.type === 'COUPON_CODE');
      
      if (coupon) {
        setTemplateType('coupon');
        setCouponCode(coupon.coupon_code?.[0]?.coupon_code || '');
      } else if (lto) {
        setTemplateType('limited_time_offer');
        setLtoText(lto.limited_time_offer?.text || '');
        if (lto.limited_time_offer?.expiration_time_ms) {
          setLtoHasExpiration(true);
          setLtoExpiration(new Date(lto.limited_time_offer.expiration_time_ms).toISOString().slice(0, 16));
        }
      } else {
        setTemplateType('standard');
      }
    }
  };

  const buildComponents = useMemo((): TemplateComponent[] => {
    const comps: TemplateComponent[] = [];
    
    if (templateType === 'carousel') {
      // Componente BODY principal (aparece acima do carrossel)
      comps.push({ 
        type: 'BODY', 
        text: formBody || 'Confira nossas ofertas:' 
      });

      // Componente CAROUSEL (específico para INTERACTIVE_CAROUSEL no backend)
      const carouselCardsData = carouselCards.map((card, idx) => ({
        card_index: idx,
        header: {
          type: (card.headerType?.toUpperCase() || 'IMAGE') as any,
          [(card.headerType?.toLowerCase() || 'image')]: { 
            link: card.headerUrl,
            // O backend/Meta às vezes usa handle para criação inicial
            example: { header_handle: [card.headerHandle || ''] }
          }
        },
        body: { text: card.bodyText },
        action: {
          // Para carrossel interativo, o botão pode ser cta_url ou quick_reply
          buttons: [
            card.buttonUrl ? {
              type: 'url',
              text: card.buttonDisplayText,
              url: card.buttonUrl
            } : {
              type: 'quick_reply',
              text: card.buttonDisplayText
            }
          ]
        }
      }));

      comps.push({ 
        type: 'CAROUSEL', 
        example: { cards: carouselCardsData } as any 
      });

    } else {
      // HEADER (Standard)
      if (formHeaderType !== 'none') {
        comps.push({ 
          type: 'HEADER', 
          format: formHeaderType.toUpperCase() as any, 
          text: formHeaderType === 'text' ? formHeaderText : undefined, 
          example: formHeaderType !== 'text' ? { header_handle: [headerHandle] } : undefined,
          _local_url: headerImageUrl // Campo auxiliar para o backend salvar path local
        } as any);
      }

      // BODY
      comps.push({ type: 'BODY', text: formBody });

      // FOOTER
      if (formFooter) comps.push({ type: 'FOOTER', text: formFooter });

      // BUTTONS
      if (formButtons.length > 0) {
        comps.push({ type: 'BUTTONS', buttons: formButtons });
      }

      // MARKETING TYPES
      if (templateType === 'coupon') {
        comps.push({ 
          type: 'COUPON_CODE', 
          coupon_code: [{ type: 'COPY_CODE', coupon_code: couponCode }] 
        } as any);
      }

      if (templateType === 'limited_time_offer') {
        comps.push({ 
          type: 'LIMITED_TIME_OFFER', 
          limited_time_offer: { 
            text: ltoText, 
            expiration_time_ms: ltoHasExpiration ? new Date(ltoExpiration).getTime() : undefined 
          } 
        } as any);
      }
    }

    return comps;
  }, [templateType, formHeaderType, formHeaderText, formBody, formFooter, formButtons, carouselCards, couponCode, ltoText, ltoExpiration, ltoHasExpiration, headerHandle, headerImageUrl]);

  const salvarTemplate = async () => {
    if (!formName) return alert('Nome obrigatório');
    
    // Validar Carrossel
    if (templateType === 'carousel') {
      if (carouselCards.length < 2) return alert('O carrossel precisa de pelo menos 2 cards.');
      if (carouselCards.some(c => !c.bodyText)) return alert('Todos os cards do carrossel precisam de uma descrição.');
    }

    setSaving(true);
    try {
      const payload = { 
        name: formName, 
        category: templateType === 'carousel' ? 'INTERACTIVE_CAROUSEL' : formCategory, 
        language: formLanguage, 
        components: buildComponents 
      };

      if (formMode === 'create') {
        await templatesApi.criar(payload);
      } else if (selectedTemplate) {
        await templatesApi.editar(selectedTemplate.id, payload);
      }
      
      resetForm(); 
      carregarTemplates(); 
      alert('Template salvo com sucesso!');
    } catch (e: any) { 
      console.error('Erro ao salvar template:', e);
      alert(e.response?.data?.detail || 'Erro ao salvar. Verifique se os campos estão corretos conforme a documentação da Meta.'); 
    } finally { 
      setSaving(false); 
    }
  };

  const triggerCardUpload = (idx: number) => {
    pendingCardUploadIndexRef.current = idx;
    cardFileInputRef.current?.click();
  };

  const handleCardMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = pendingCardUploadIndexRef.current;
    if (!file || idx === null) return;

    const inputEl = e.target;
    setUploadingCardIndex(idx);
    try {
      const res = await templatesApi.uploadMedia(file);
      if (!res.url) throw new Error('URL de upload vazia');
      setCarouselCards(prev => prev.map((c, i) =>
        i === idx ? { ...c, headerUrl: res.url, headerHandle: res.header_handle || '' } : c
      ));
    } catch (err) {
      console.error('Erro no upload de mídia do card:', err);
      alert('Erro no upload da imagem do card.');
    } finally {
      setUploadingCardIndex(null);
      pendingCardUploadIndexRef.current = null;
      inputEl.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file) return;
    
    setUploadingImage(true);
    try {
      const res = await templatesApi.uploadMedia(file);
      setHeaderImageUrl(res.url); 
      setHeaderHandle(res.header_handle || res.handle || '');
    } catch (e) { 
      console.error('Erro no upload de imagem:', e);
      alert('Erro no upload da imagem de cabeçalho.'); 
    } finally { 
      setUploadingImage(false); 
    }
  };

  const enviarTemplate = async () => {
    if (!selectedTemplate || !sendNumber.trim()) return;
    setSending(true);
    try {
      await templatesApi.enviar(selectedTemplate.id, {
        whatsapp_number: sendNumber.trim(),
        language: selectedTemplate.language || 'pt_BR',
      });
      setSendModal(false);
      setSendNumber('');
      alert('Template enviado com sucesso!');
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden transition-all duration-500 font-sans shadow-inner" style={{ background: colors.dashboardBg }}>
      
      {/* SIDEBAR (TEMA ESCURO CORRIGIDO COM NEON) */}
      <aside className={`border-r flex flex-col transition-all duration-500 shadow-2xl ${sidebarOpen ? 'w-80' : 'w-0 opacity-0 overflow-hidden'}`} style={{ background: colors.sidebarBg, borderColor: colors.border }}>
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
          <h2 className="font-black text-[10px] uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>Templates ({totalTemplates})</h2>
          <button onClick={() => setSidebarOpen(false)} style={{ color: colors.textSecondary }}>✕</button>
        </div>
        
        <div className="p-4 space-y-4">
           <input type="text" placeholder="Buscar template..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full px-4 py-3 border rounded-2xl text-xs outline-none transition-all focus:ring-2 shadow-inner" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: colors.primary }} />
           <button onClick={resetForm} className="w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95" style={{ borderColor: colors.border, color: colors.primary, background: `${colors.primary}11` }}>+ Criar Novo</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 no-scrollbar">
           {templates.map(tmpl => (
             <div key={tmpl.id} onClick={() => loadTemplateIntoForm(tmpl)} className={`p-4 rounded-2xl border cursor-pointer transition-all group ${selectedTemplate?.id === tmpl.id ? 'ring-2' : ''}`} style={{ background: selectedTemplate?.id === tmpl.id ? `${colors.primary}15` : colors.cardBg, borderColor: selectedTemplate?.id === tmpl.id ? colors.primary : colors.border }}>
               <div className="flex justify-between items-start mb-2">
                 <span className="font-black text-[11px] uppercase tracking-tighter line-clamp-1 shadow-sm" style={{ color: selectedTemplate?.id === tmpl.id ? colors.primary : colors.textPrimary }}>{tmpl.name}</span>
                 <StatusBadge status={tmpl.status} />
               </div>
               <div className="flex justify-between items-end">
                 <span className="text-[8px] font-black uppercase tracking-[0.1em]" style={{ color: theme === 'yoursystem' ? '#00e5ff' : colors.textSecondary }}>{tmpl.category}</span>
                 <div className="flex gap-3"><button onClick={(e) => { e.stopPropagation(); setSelectedTemplate(tmpl); setSendModal(true); }} className="hover:scale-125 transition-transform text-xs">📤</button><button onClick={(e) => { e.stopPropagation(); if(window.confirm('Excluir?')) templatesApi.deletar(tmpl.id).then(carregarTemplates); }} className="hover:scale-125 transition-transform opacity-30 text-xs">🗑️</button></div>
               </div>
             </div>
           ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative shadow-inner">
        <header className="h-20 border-b px-8 flex items-center justify-between sticky top-0 z-30 backdrop-blur-xl" style={{ background: `${colors.cardBg}cc`, borderColor: colors.border }}>
           <div className="flex items-center gap-6">
             {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-3 rounded-2xl hover:bg-black/5" style={{ color: colors.textPrimary }}>☰</button>}
             <button onClick={() => window.location.href='/empresa/dashboard'} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/30 text-blue-500 hover:scale-105 transition-all shadow-lg">← Dashboard</button>
             <h1 className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: colors.textPrimary }}>{formMode === 'edit' ? 'Editar' : 'Criar'} Template</h1>
           </div>
           
           <div className="flex items-center gap-4">
             <LangToggle /><div className="scale-110"><ThemeToggle /></div>
             <button onClick={salvarTemplate} disabled={saving || !formName} className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white rounded-full transition-all hover:scale-105 shadow-xl shadow-blue-500/20" style={{ background: colors.gradientButton }}>
               {saving ? '...' : 'Salvar Template'}
             </button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 no-scrollbar">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10">
            
            {/* FORMULÁRIO ESQUERDA */}
            <div className="md:col-span-12 lg:col-span-7 xl:col-span-8 space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
              
              <section className="rounded-[2.5rem] shadow-2xl border p-8 space-y-8 transition-all duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
                <div className="flex flex-col gap-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 ml-2" style={{ color: colors.textPrimary }}>Tipo de Template</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-2 rounded-[2rem] shadow-inner" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' }}>
                     {[
                       { id: 'standard', icon: '📄', label: 'Padrão' },
                       { id: 'carousel', icon: '🎠', label: 'Carrossel' },
                       { id: 'catalog', icon: '🛍️', label: 'Catálogo' },
                       { id: 'limited_time_offer', icon: '⏳', label: 'Oferta' },
                       { id: 'coupon', icon: '🎟️', label: 'Cupom' }
                     ].map(type => (
                       <button 
                         key={type.id} 
                         onClick={() => setTemplateType(type.id as any)} 
                         className={`py-4 rounded-2xl text-[9px] font-black uppercase transition-all flex flex-col items-center gap-1 ${templateType === type.id ? 'shadow-2xl scale-105 ring-2 ring-white/10' : 'opacity-50 hover:opacity-100 hover:scale-[1.02]'}`} 
                         style={{ 
                           background: templateType === type.id ? (theme === 'yoursystem' ? colors.primary : colors.cardBg) : 'transparent', 
                           color: templateType === type.id ? '#fff' : colors.textSecondary 
                         }}
                       >
                         <span className="text-xl mb-1">{type.icon}</span>
                         {type.label}
                       </button>
                     ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-3 opacity-50" style={{ color: colors.textPrimary }}>Identificador API (Nome Único)</label>
                    <input 
                      type="text" 
                      value={formName} 
                      onChange={e => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} 
                      disabled={formMode === 'edit'} 
                      placeholder="ex: promocao_natal_2026"
                      className={`w-full px-6 py-5 rounded-2xl outline-none border font-mono text-sm transition-all focus:ring-4 shadow-inner ${formName && !validateTemplateName(formName) ? 'border-red-500 ring-red-500/20' : ''}`} 
                      style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: `${colors.primary}22` }} 
                    />
                    <p className="mt-2 text-[9px] opacity-40 font-bold uppercase tracking-widest">Apenas minúsculas, números e sublinhados (_). Máx 512 caracteres.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase mb-3 opacity-50" style={{ color: colors.textPrimary }}>Categoria Meta</label>
                    <select 
                      value={formCategory} 
                      onChange={e => setFormCategory(e.target.value)} 
                      className="w-full px-6 py-5 rounded-2xl outline-none border font-black shadow-inner appearance-none cursor-pointer" 
                      style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }}
                    >
                      <option value="MARKETING">Marketing (Vendas/Promoção)</option>
                      <option value="UTILITY">Utilidade (Status/Alertas)</option>
                      <option value="AUTHENTICATION">Autenticação (OTP/Códigos)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase mb-3 opacity-50" style={{ color: colors.textPrimary }}>Idioma</label>
                    <select 
                      value={formLanguage} 
                      onChange={e => setFormLanguage(e.target.value)} 
                      className="w-full px-6 py-5 rounded-2xl outline-none border font-black shadow-inner appearance-none cursor-pointer" 
                      style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }}
                    >
                      <option value="pt_BR">Português (Brasil)</option>
                      <option value="en_US">English (US)</option>
                      <option value="es_ES">Español</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-[2.5rem] shadow-2xl border p-8 space-y-8 transition-all duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
                
                {templateType === 'carousel' ? (
                  <div className="space-y-8">
                    <input type="file" ref={cardFileInputRef} className="hidden" accept="image/*" onChange={handleCardMediaUpload} />
                    <div className="flex justify-between items-center border-b pb-6" style={{ borderColor: colors.border }}>
                       <div className="flex flex-col">
                         <h3 className="font-black text-sm uppercase tracking-widest shadow-sm" style={{ color: colors.textPrimary }}>Cards do Carrossel</h3>
                         <span className="text-[9px] opacity-40 font-bold uppercase mt-1">Mínimo 2, Máximo 10 cards</span>
                       </div>
                       <button 
                         onClick={() => setCarouselCards([...carouselCards, defaultCard(carouselCards.length)])} 
                         disabled={carouselCards.length >= 10} 
                         className="text-[10px] font-black bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-30"
                       >
                         + ADICIONAR CARD
                       </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {carouselCards.map((card, idx) => (
                        <div key={idx} className="p-6 border-2 rounded-[2.5rem] space-y-5 relative group shadow-2xl transition-all hover:border-blue-500/30" style={{ background: theme === 'yoursystem' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)', borderColor: colors.border }}>
                           <button 
                             onClick={() => setCarouselCards(carouselCards.filter((_, i) => i !== idx))} 
                             className="absolute top-5 right-5 w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all font-black hover:bg-red-500 hover:text-white"
                           >
                             ✕
                           </button>
                           
                           <div
                             onClick={() => triggerCardUpload(idx)}
                             className="border-2 border-dashed rounded-3xl cursor-pointer overflow-hidden relative hover:border-blue-500/50 transition-all shadow-inner bg-black/5"
                             style={{ height: '160px' }}
                           >
                             {uploadingCardIndex === idx ? (
                               <div className="absolute inset-0 bg-blue-500/20 flex flex-col items-center justify-center animate-pulse z-20">
                                 <span className="text-4xl animate-spin">⚡</span>
                                 <span className="text-[10px] font-black mt-3 tracking-widest">SUBINDO MÍDIA...</span>
                               </div>
                             ) : card.headerUrl ? (
                               <img
                                 src={getFullUrl(card.headerUrl)}
                                 alt={`Card ${idx + 1}`}
                                 style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                 onLoad={() => console.log('✅ Card image loaded:', getFullUrl(card.headerUrl))}
                                 onError={() => console.error('❌ Card image failed:', getFullUrl(card.headerUrl))}
                               />
                             ) : (
                               <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-bold" style={{ opacity: 0.7 }}>
                                 <span className="text-4xl">🖼️</span>
                                 <div className="flex flex-col items-center">
                                   <span className="text-[10px] font-black uppercase tracking-widest">Imagem do Card {idx + 1}</span>
                                   <span className="text-[8px] mt-1 opacity-60">Recomendado: 800x800px</span>
                                 </div>
                               </div>
                             )}
                           </div>

                           <div className="space-y-3">
                             <div className="flex justify-between items-center px-1">
                               <label className="text-[9px] font-black uppercase opacity-40">Descrição do Card</label>
                               <span className={`text-[9px] font-black ${card.bodyText.length > 160 ? 'text-red-500' : 'opacity-30'}`}>{card.bodyText.length}/160</span>
                             </div>
                             <textarea 
                               value={card.bodyText} 
                               onChange={e => setCarouselCards(carouselCards.map((c, i) => i === idx ? { ...c, bodyText: e.target.value.slice(0, 160) } : c))} 
                               className="w-full p-4 rounded-2xl text-xs outline-none border-2 font-medium shadow-inner transition-all focus:border-blue-500/30" 
                               style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} 
                               rows={3} 
                               placeholder="Texto que aparecerá no card..." 
                             />
                           </div>

                           <div className="space-y-3">
                             <label className="text-[9px] font-black uppercase opacity-40 px-1">Texto do Botão</label>
                             <input 
                               value={card.buttonDisplayText} 
                               onChange={e => setCarouselCards(carouselCards.map((c, i) => i === idx ? { ...c, buttonDisplayText: e.target.value.slice(0, 25) } : c))} 
                               className="w-full p-4 rounded-2xl text-[11px] font-black uppercase outline-none border-2 transition-all focus:border-blue-500/30 shadow-inner" 
                               style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} 
                               placeholder="Ex: Ver Produto" 
                             />
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* CONTEÚDO PADRÃO */}
                <div className="space-y-10">
                  {templateType !== 'carousel' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50 ml-2" style={{ color: colors.textPrimary }}>Cabeçalho (Header)</label>
                        {formHeaderType === 'text' && <span className={`text-[10px] font-black ${formHeaderText.length > MAX_HEADER_TEXT ? 'text-red-500' : 'opacity-30'}`}>{formHeaderText.length}/{MAX_HEADER_TEXT}</span>}
                      </div>
                      
                      <div className="flex flex-wrap gap-3">
                        {['none', 'text', 'image', 'video', 'document'].map(t => (
                          <button 
                            key={t} 
                            onClick={() => setFormHeaderType(t)} 
                            className={`px-8 py-3 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${formHeaderType === t ? 'scale-105 shadow-2xl ring-4 ring-white/5' : 'opacity-40 hover:opacity-100'}`} 
                            style={{ 
                              borderColor: formHeaderType === t ? colors.primary : colors.border, 
                              color: formHeaderType === t ? '#fff' : colors.textSecondary,
                              background: formHeaderType === t ? colors.primary : 'transparent'
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>

                      {formHeaderType === 'text' && (
                        <input 
                          type="text" 
                          value={formHeaderText} 
                          onChange={e => setFormHeaderText(e.target.value.slice(0, MAX_HEADER_TEXT))} 
                          placeholder="Título atraente para sua mensagem..." 
                          className="w-full px-8 py-5 border-2 rounded-[2rem] outline-none font-black text-sm shadow-inner transition-all focus:ring-4" 
                          style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: `${colors.primary}11` }} 
                        />
                      )}

                      {['image', 'video', 'document'].includes(formHeaderType) && (
                        <div 
                          onClick={() => fileInputRef.current?.click()} 
                          className="p-16 border-2 border-dashed rounded-[3rem] text-center cursor-pointer bg-black/5 hover:bg-blue-500/5 hover:border-blue-500/30 transition-all group relative overflow-hidden shadow-inner"
                        >
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                          {uploadingImage ? (
                            <div className="absolute inset-0 bg-blue-500/20 flex flex-col items-center justify-center animate-pulse z-20">
                              <span className="text-5xl animate-spin">💎</span>
                              <span className="text-xs font-black mt-4 uppercase tracking-[0.3em]">Otimizando Mídia...</span>
                            </div>
                          ) : headerImageUrl ? (
                            <div className="space-y-4">
                              <img src={getFullUrl(headerImageUrl)} className="max-h-56 mx-auto rounded-3xl shadow-2xl border-4 border-white/10 transition-transform group-hover:scale-105" alt="header upload" />
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-black uppercase text-blue-500">Mídia Carregada ✓</span>
                                <span className="text-[9px] opacity-40 font-bold uppercase">Clique para alterar</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 opacity-30 group-hover:opacity-100 transition-all">
                              <div className="text-6xl filter grayscale group-hover:grayscale-0 transition-all">📤</div>
                              <div className="flex flex-col gap-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.4em]">Upload de {formHeaderType}</p>
                                <p className="text-[9px] font-bold opacity-60">Arraste o arquivo ou clique para selecionar</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="flex justify-between items-center px-2">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Corpo da Mensagem (Body)</label>
                        <span className="text-[8px] opacity-40 font-bold uppercase mt-1">Variáveis como {"{{1}}"} são suportadas</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-black ${formBody.length > MAX_BODY ? 'text-red-500' : 'opacity-30'}`}>{formBody.length}/{MAX_BODY}</span>
                        <button 
                          className="text-[10px] font-black bg-blue-500 text-white px-4 py-2 rounded-xl hover:scale-105 transition-all shadow-lg" 
                          onClick={() => setFormBody(prev => prev + ` {{${(prev.match(/\{\{\d+\}\}/g) || []).length + 1}}}`)}
                        >
                          + VARIÁVEL
                        </button>
                      </div>
                    </div>
                    <textarea 
                      value={formBody} 
                      onChange={e => setFormBody(e.target.value.slice(0, MAX_BODY))} 
                      rows={8} 
                      className="w-full p-8 rounded-[2.5rem] outline-none border-2 transition-all leading-relaxed text-sm shadow-inner focus:ring-4" 
                      style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: `${colors.primary}11` }} 
                      placeholder={templateType === 'carousel' ? "O texto que aparece ANTES do carrossel começar..." : "Digite o conteúdo principal da sua mensagem aqui..."} 
                    />
                  </div>

                  {templateType !== 'carousel' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50" style={{ color: colors.textPrimary }}>Rodapé (Footer)</label>
                        <span className={`text-[10px] font-black ${formFooter.length > MAX_FOOTER ? 'text-red-500' : 'opacity-30'}`}>{formFooter.length}/{MAX_FOOTER}</span>
                      </div>
                      <input 
                        type="text" 
                        value={formFooter} 
                        onChange={e => setFormFooter(e.target.value.slice(0, MAX_FOOTER))} 
                        placeholder="Ex: Não responda a este número." 
                        className="w-full px-8 py-5 rounded-2xl outline-none text-[12px] font-bold shadow-inner border-2 transition-all" 
                        style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }} 
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* MARKETING SETTINGS (MODERNIZADO) */}
              {(templateType === 'coupon' || templateType === 'limited_time_offer') && (
                <section className="rounded-[2.5rem] shadow-2xl border p-10 space-y-8 animate-in zoom-in-95 duration-500" style={{ background: `linear-gradient(135deg, ${colors.cardBg}, ${colors.dashboardBg})`, borderColor: colors.primary + '33' }}>
                  <div className="flex items-center gap-4 border-b pb-6" style={{ borderColor: colors.primary + '22' }}>
                    <span className="text-3xl">{templateType === 'coupon' ? '🎟️' : '⏳'}</span>
                    <div className="flex flex-col">
                      <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: colors.textPrimary }}>Configurações da Oferta</h3>
                      <span className="text-[10px] opacity-50 font-black uppercase">Exclusivo para campanhas de Marketing</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {templateType === 'coupon' && (
                      <div className="col-span-2 space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] opacity-50 ml-2" style={{ color: colors.textPrimary }}>Código do Cupom</label>
                        <div className="relative group">
                          <input 
                            value={couponCode} 
                            onChange={e => setCouponCode(e.target.value.toUpperCase().slice(0, MAX_COUPON_CODE))} 
                            placeholder="EX: DESCONTO30" 
                            className="w-full px-8 py-6 rounded-[2rem] border-4 font-black tracking-[0.5em] text-center text-xl shadow-2xl transition-all focus:ring-8" 
                            style={{ background: colors.inputBg, color: colors.primary, borderColor: colors.primary, ringColor: `${colors.primary}15` }} 
                          />
                          <div className="absolute inset-0 rounded-[2rem] pointer-events-none group-hover:ring-2 ring-white/10 transition-all" />
                        </div>
                        <p className="text-[9px] text-center font-black uppercase opacity-40 tracking-widest">O cliente poderá copiar este código com apenas um toque.</p>
                      </div>
                    )}
                    {templateType === 'limited_time_offer' && (
                      <><div className="col-span-2"><label className="block text-[10px] font-black uppercase mb-3 opacity-50" style={{ color: colors.textPrimary }}>Texto da Oferta</label><input value={ltoText} onChange={e => setLtoText(e.target.value)} placeholder="Oferta válida até..." className="w-full px-6 py-4 rounded-2xl border shadow-inner transition-all focus:ring-4" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: `${colors.primary}22` }} /></div>
                        <div className="col-span-2 flex items-center gap-4 bg-black/5 p-4 rounded-2xl border shadow-sm" style={{ borderColor: colors.border }}><input type="checkbox" checked={ltoHasExpiration} onChange={e => setLtoHasExpiration(e.target.checked)} className="w-5 h-5 rounded shadow-sm" /><label className="text-xs font-black uppercase tracking-tighter opacity-60 font-black" style={{ color: colors.textPrimary }}>Ativar Data de Expiração (Obrigatório LTO)</label>{ltoHasExpiration && <input type="datetime-local" value={ltoExpiration} onChange={e => setLtoExpiration(e.target.value)} className="px-4 py-2 rounded-xl border text-xs font-bold outline-none shadow-xl transition-all" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.primary }} />}</div></>
                    )}
                  </div>
                </section>
              )}

              {/* BOTÕES */}
              {templateType !== 'carousel' && (
                <section className="rounded-[2.5rem] shadow-2xl border p-8 transition-all duration-500" style={{ background: colors.cardBg, borderColor: colors.border }}>
                  <div className="flex justify-between items-center mb-6"><h3 className="font-black text-[10px] uppercase tracking-widest opacity-50" style={{ color: colors.textPrimary }}>Ações</h3><button onClick={() => setFormButtons([...formButtons, { type: 'QUICK_REPLY', text: '' }])} disabled={formButtons.length >= 10} className="text-[9px] font-black bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg hover:scale-105 transition-all">+ BOTÃO</button></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formButtons.map((btn, i) => (
                      <div key={i} className="p-5 border rounded-2xl flex flex-col gap-3 relative group transition-all shadow-sm hover:border-blue-500/50" style={{ borderColor: colors.border, background: colors.inputBg }}>
                        <button onClick={() => setFormButtons(formButtons.filter((_, idx) => idx !== i))} className="absolute top-2 right-4 text-red-500 opacity-0 group-hover:opacity-100 transition-all font-bold">✕</button>
                        <select value={btn.type} onChange={e => { const nb = [...formButtons]; nb[i].type = e.target.value as any; setFormButtons(nb); }} className="w-full bg-transparent outline-none text-[10px] font-black uppercase opacity-50"><option value="QUICK_REPLY">Resposta</option><option value="URL">Link Web</option><option value="PHONE_NUMBER">Ligar</option></select>
                        <input value={btn.text} onChange={e => { const nb = [...formButtons]; nb[i].text = e.target.value; setFormButtons(nb); }} className="w-full bg-transparent outline-none text-xs font-black uppercase tracking-tighter" placeholder="Texto..." />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* PREVIEW IPHONE */}
            <div className="md:col-span-12 lg:col-span-5 xl:col-span-4 animate-in fade-in slide-in-from-right-4 duration-1000 shadow-2xl">
              <div className="sticky top-10 space-y-8">
                <TemplateChatPreview components={buildComponents} name={formName || 'preview'} headerImageUrl={headerImageUrl} templateType={templateType} couponCode={couponCode} carouselCards={templateType === 'carousel' ? carouselCards : undefined} paramExamples={paramExamples} />
                {selectedTemplate && (
                  <div className="p-8 rounded-[2.5rem] border shadow-2xl space-y-6 transition-all duration-500 relative overflow-hidden" style={{ background: colors.cardBg, borderColor: colors.border }}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 shadow-[0_0_15px_#3b82f6] animate-pulse" />
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 shadow-sm" style={{ color: colors.textPrimary }}>Qualidade Meta</span><span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border" style={{ color: colors.textSecondary, borderColor: colors.border }}>{selectedTemplate.quality_score || '—'}</span></div>
                    <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}><span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 shadow-sm" style={{ color: colors.textPrimary }}>Status Atual</span><StatusBadge status={selectedTemplate.status} /></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL DE TESTE */}
        {sendModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md rounded-[3rem] shadow-2xl border p-10 space-y-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]" style={{ background: colors.cardBg, borderColor: colors.border }}>
              <div className="text-center space-y-3"><div className="w-16 h-16 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto text-3xl shadow-inner border border-blue-500/20 font-bold">🚀</div><h3 className="text-xl font-black uppercase tracking-tighter shadow-sm" style={{ color: colors.textPrimary }}>Disparar Teste</h3><p className="text-[10px] font-black uppercase tracking-widest opacity-40 shadow-sm" style={{ color: colors.textPrimary }}>{selectedTemplate?.name}</p></div>
              <div className="space-y-6"><div><label className="block text-[10px] font-black uppercase mb-3 opacity-50" style={{ color: colors.textPrimary }}>Número WhatsApp</label><input value={sendNumber} onChange={e => setSendNumber(e.target.value)} placeholder="5511999999999" className="w-full px-8 py-5 rounded-[1.5rem] outline-none border font-black text-center text-lg shadow-xl transition-all focus:ring-4 shadow-inner" style={{ background: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder, ringColor: `${colors.primary}33` }} /></div><div className="flex gap-4"><button onClick={() => setSendModal(false)} className="flex-1 py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest opacity-50 hover:bg-black/5 transition-all shadow-sm" style={{ color: colors.textPrimary }}>Cancelar</button><button onClick={enviarTemplate} disabled={sending} className="flex-1 py-5 rounded-[1.5rem] font-black text-[10px] uppercase text-white shadow-2xl hover:scale-105 active:scale-95 transition-all shadow-blue-500/40 font-bold" style={{ background: colors.gradientButton }}>{sending ? '...' : 'Enviar Agora'}</button></div></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TemplateManager;
