import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import { contatosApi, templatesApi } from '../services/api';
import { ContatoUnificado, ListaContatos, MessageTemplate, TemplateComponent } from '../types';

// Helper: extrair parâmetros {{1}}, {{2}} de um template
function extractTemplateParams(template: MessageTemplate): {
  bodyParams: string[];
  headerFormat: string | null;
  hasCopyCode: boolean;
  hasUrlButton: boolean;
} {
  let bodyParams: string[] = [];
  let headerFormat: string | null = null;
  let hasCopyCode = false;
  let hasUrlButton = false;

  for (const comp of template.components || []) {
    const type = (comp.type || '').toUpperCase();
    if (type === 'BODY' && comp.text) {
      const matches = comp.text.match(/\{\{(\d+)\}\}/g) || [];
      bodyParams = matches.map(m => m.replace(/[{}]/g, ''));
    }
    if (type === 'HEADER') {
      headerFormat = (comp.format || 'TEXT').toUpperCase();
    }
    if (type === 'BUTTONS' && comp.buttons) {
      for (const btn of comp.buttons) {
        if ((btn.type || '').toUpperCase() === 'COPY_CODE') hasCopyCode = true;
        if ((btn.type || '').toUpperCase() === 'URL') hasUrlButton = true;
      }
    }
  }

  return { bodyParams, headerFormat, hasCopyCode, hasUrlButton };
}

// Helper: obter texto do body do template para preview
function getTemplateBodyText(template: MessageTemplate): string {
  for (const comp of template.components || []) {
    if ((comp.type || '').toUpperCase() === 'BODY') {
      return comp.text || '';
    }
  }
  return '';
}

const ContatosPage: React.FC = () => {
  const { colors } = useTheme();
  const [contatos, setContatos] = useState<ContatoUnificado[]>([]);
  const [totalContatos, setTotalContatos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [selectedContatos, setSelectedContatos] = useState<Set<string>>(new Set());

  // Listas
  const [listas, setListas] = useState<ListaContatos[]>([]);
  const [showListasPanel, setShowListasPanel] = useState(false);
  const [novaListaNome, setNovaListaNome] = useState('');
  const [novaListaCor, setNovaListaCor] = useState('#3B82F6');

  // Send template modal
  const [sendModal, setSendModal] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // Smart parameters state
  const [useContactName, setUseContactName] = useState(true);
  const [fallbackName, setFallbackName] = useState('Olá');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [couponCode, setCouponCode] = useState('');

  // Add to list modal
  const [addToListModal, setAddToListModal] = useState(false);
  const [selectedListaId, setSelectedListaId] = useState<number | null>(null);

  // CSV import
  const [importModal, setImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importListaId, setImportListaId] = useState<number | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarContatos();
  }, [page, searchQuery, filterTipo]);

  useEffect(() => {
    carregarListas();
  }, []);

  const carregarContatos = async () => {
    try {
      setLoading(true);
      const result = await contatosApi.listar({
        page,
        per_page: 20,
        search: searchQuery || undefined,
        tipo: filterTipo || undefined,
      });
      setContatos(result.contatos);
      setTotalContatos(result.total);
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarListas = async () => {
    try {
      const result = await contatosApi.listarListas();
      setListas(result);
    } catch (error) {
      console.error('Erro ao carregar listas:', error);
    }
  };

  const exportarCSV = async () => {
    try {
      const blob = await contatosApi.exportar();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contatos.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Erro ao exportar');
    }
  };

  const importarCSV = async (file: File) => {
    setImporting(true);
    try {
      const result = await contatosApi.importarCSV(file, importListaId || undefined);
      alert(
        `Importação concluída!\n` +
        `${result.criados} criados, ${result.atualizados} atualizados, ${result.erros} erros\n` +
        (result.adicionados_lista ? `${result.adicionados_lista} adicionados à lista` : '')
      );
      setImportModal(false);
      setImportListaId(null);
      carregarContatos();
      carregarListas();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao importar CSV');
    } finally {
      setImporting(false);
    }
  };

  const criarLista = async () => {
    if (!novaListaNome) return;
    try {
      await contatosApi.criarLista({ nome: novaListaNome, cor: novaListaCor });
      setNovaListaNome('');
      carregarListas();
    } catch (error) {
      alert('Erro ao criar lista');
    }
  };

  const deletarLista = async (id: number) => {
    if (!window.confirm('Deletar esta lista?')) return;
    try {
      await contatosApi.deletarLista(id);
      carregarListas();
    } catch (error) {
      alert('Erro ao deletar lista');
    }
  };

  const toggleSelect = (number: string) => {
    const next = new Set(selectedContatos);
    if (next.has(number)) next.delete(number);
    else next.add(number);
    setSelectedContatos(next);
  };

  const toggleSelectAll = () => {
    if (selectedContatos.size === contatos.length) {
      setSelectedContatos(new Set());
    } else {
      setSelectedContatos(new Set(contatos.map(c => c.whatsapp_number)));
    }
  };

  const openSendModal = async () => {
    if (selectedContatos.size === 0) {
      alert('Selecione pelo menos um contato');
      return;
    }
    try {
      const result = await templatesApi.listar({ status: 'APPROVED', per_page: 100 });
      setTemplates(result.templates);
      // Reset modal state
      setSelectedTemplateId(null);
      setUseContactName(true);
      setFallbackName('Olá');
      setParamValues({});
      setMediaUrl('');
      setCouponCode('');
      setSendModal(true);
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      alert('Erro ao carregar templates: ' + (error.response?.data?.detail || error.message || 'Erro desconhecido'));
    }
  };

  // Template selecionado e suas propriedades
  const selectedTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const templateInfo = useMemo(() => {
    if (!selectedTemplate) return null;
    return extractTemplateParams(selectedTemplate);
  }, [selectedTemplate]);

  const enviarEmMassa = async () => {
    if (!selectedTemplateId) return;
    setSending(true);
    try {
      // Montar parameter_values
      const pv: Record<string, string> = {};

      // Se NÃO usar nome do contato, usar o valor fixo do {{1}}
      if (!useContactName && paramValues['1']) {
        pv['1'] = paramValues['1'];
      }

      // Outros parâmetros ({{2}}, {{3}}, etc.)
      if (templateInfo) {
        for (const p of templateInfo.bodyParams) {
          if (p !== '1' && paramValues[p]) {
            pv[p] = paramValues[p];
          }
        }
      }

      // Coupon code
      if (couponCode) {
        pv['coupon_code'] = couponCode;
      }

      const result = await templatesApi.enviarMassa({
        template_id: selectedTemplateId,
        whatsapp_numbers: Array.from(selectedContatos),
        use_contact_name: useContactName,
        fallback_name: fallbackName,
        parameter_values: Object.keys(pv).length > 0 ? pv : undefined,
        media_url: mediaUrl || undefined,
        coupon_code: couponCode || undefined,
      });

      if (result.task_id) {
        alert(`Envio em massa iniciado!\n${selectedContatos.size} contatos serão processados em background.`);
        setSendModal(false);
        setSelectedContatos(new Set());
      } else if (result.erros > 0 && result.enviados === 0) {
        // Todos falharam — mostrar erro detalhado
        const detalhes = (result.resultados || [])
          .filter((r: any) => !r.success)
          .map((r: any) => `• ${r.whatsapp_number}: ${r.error || 'Erro desconhecido'}`)
          .join('\n');
        alert(`❌ Nenhuma mensagem foi enviada.\n\n${detalhes}`);
        // Não fecha o modal para o usuário poder corrigir
      } else if (result.erros > 0) {
        // Envio parcial
        alert(`⚠️ ${result.enviados} enviadas, ${result.erros} falharam.\n\nVerifique os números e tente novamente para os que falharam.`);
        setSendModal(false);
        setSelectedContatos(new Set());
      } else {
        alert(`✅ ${result.enviados} mensagem(ns) enviada(s) com sucesso!`);
        setSendModal(false);
        setSelectedContatos(new Set());
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const deletarContato = async (whatsappNumber: string, nome?: string) => {
    const ok = window.confirm(
      `Apagar contato ${nome || whatsappNumber}?\n\nTodo o histórico de mensagens será removido. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    try {
      await contatosApi.deletarContato(whatsappNumber);
      setContatos(prev => prev.filter(c => c.whatsapp_number !== whatsappNumber));
      setSelectedContatos(prev => { const next = new Set(prev); next.delete(whatsappNumber); return next; });
      setTotalContatos(prev => prev - 1);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Erro ao apagar contato');
    }
  };

  const deletarSelecionados = async () => {
    if (selectedContatos.size === 0) return;
    const ok = window.confirm(
      `Apagar ${selectedContatos.size} contato(s) selecionados?\n\nTodo o histórico de mensagens será removido. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    let sucesso = 0;
    for (const number of Array.from(selectedContatos)) {
      try {
        await contatosApi.deletarContato(number);
        sucesso++;
      } catch { /* continua */ }
    }
    setContatos(prev => prev.filter(c => !selectedContatos.has(c.whatsapp_number)));
    setTotalContatos(prev => prev - sucesso);
    setSelectedContatos(new Set());
    alert(`${sucesso} contato(s) removidos.`);
  };

  const adicionarALista = async () => {
    if (!selectedListaId || selectedContatos.size === 0) return;
    try {
      const contatosParaAdicionar = contatos
        .filter(c => selectedContatos.has(c.whatsapp_number))
        .map(c => ({
          whatsapp_number: c.whatsapp_number,
          nome: c.nome,
          cliente_id: c.cliente_id,
        }));
      const result = await contatosApi.adicionarALista(selectedListaId, contatosParaAdicionar);
      alert(`${result.adicionados} adicionados, ${result.duplicados} duplicados`);
      setAddToListModal(false);
      setSelectedContatos(new Set());
      carregarListas();
    } catch (error) {
      alert('Erro ao adicionar à lista');
    }
  };

  const inputStyle: React.CSSProperties = {
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.textPrimary,
    padding: '10px 14px',
    borderRadius: 8,
    outline: 'none',
    fontSize: 14,
    width: '100%',
  };

  const totalPages = Math.ceil(totalContatos / 20);

  return (
    <div className="min-h-screen p-6" style={{ background: colors.dashboardBg }}>
      <div className="max-w-7xl mx-auto">
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
              Contatos
            </h1>
            <p style={{ color: colors.textSecondary }}>
              Gerencie seus contatos e listas de envio
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = '/empresa/dashboard'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
              style={{ background: colors.hoverBg, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
            >
              <span style={{ fontSize: 16 }}>←</span>
              Dashboard
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Main Content */}
          <div className={showListasPanel ? 'col-span-9' : 'col-span-12'}>
            <div className="rounded-2xl p-6" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 mb-4 items-center">
                <input
                  type="text"
                  placeholder="Buscar por nome ou numero..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  style={{ ...inputStyle, width: 280 }}
                />

                {/* Filter pills */}
                <div className="flex gap-2">
                  {['', 'registrado', 'nao_registrado'].map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => { setFilterTipo(tipo); setPage(1); }}
                      className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                      style={{
                        background: filterTipo === tipo ? `${colors.primary}22` : colors.hoverBg,
                        color: filterTipo === tipo ? colors.primary : colors.textSecondary,
                        border: `1px solid ${filterTipo === tipo ? colors.primary : 'transparent'}`,
                      }}
                    >
                      {tipo === '' ? 'Todos' : tipo === 'registrado' ? 'Registrados' : 'Nao Registrados'}
                    </button>
                  ))}
                </div>

                <div className="flex-1" />

                {/* Bulk actions */}
                {selectedContatos.size > 0 && (
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-medium" style={{ color: colors.primary }}>
                      {selectedContatos.size} selecionados
                    </span>
                    <button
                      onClick={openSendModal}
                      className="text-xs px-3 py-1.5 rounded-full font-medium text-white"
                      style={{ background: colors.gradientButton }}
                    >
                      Enviar Template
                    </button>
                    <button
                      onClick={() => setAddToListModal(true)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium"
                      style={{ background: `${colors.primary}22`, color: colors.primary }}
                    >
                      Add a Lista
                    </button>
                    <button
                      onClick={deletarSelecionados}
                      className="text-xs px-3 py-1.5 rounded-full font-medium"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >
                      🗑 Apagar
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowListasPanel(!showListasPanel)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: `${colors.secondary}22`, color: colors.secondary }}
                >
                  Listas
                </button>

                <button
                  onClick={() => setImportModal(true)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: `${colors.primary}15`, color: colors.primary }}
                >
                  Importar CSV
                </button>

                <button
                  onClick={exportarCSV}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: colors.hoverBg, color: colors.textSecondary }}
                >
                  Exportar CSV
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>
                        <input
                          type="checkbox"
                          checked={selectedContatos.size === contatos.length && contatos.length > 0}
                          onChange={toggleSelectAll}
                          style={{ accentColor: colors.primary }}
                        />
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Nome / WhatsApp
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Cidade
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Ultimo Contato
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Msgs
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Status
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>
                          Carregando...
                        </td>
                      </tr>
                    ) : contatos.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: colors.textSecondary }}>
                          Nenhum contato encontrado
                        </td>
                      </tr>
                    ) : contatos.map((contato) => (
                      <tr
                        key={contato.whatsapp_number}
                        style={{
                          borderBottom: `1px solid ${colors.border}`,
                          background: selectedContatos.has(contato.whatsapp_number) ? `${colors.primary}08` : 'transparent',
                        }}
                        className="transition-all"
                      >
                        <td style={{ padding: '10px 8px' }}>
                          <input
                            type="checkbox"
                            checked={selectedContatos.has(contato.whatsapp_number)}
                            onChange={() => toggleSelect(contato.whatsapp_number)}
                            style={{ accentColor: colors.primary }}
                          />
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                              {contato.nome || '—'}
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                              {contato.whatsapp_number}
                            </p>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', color: colors.textSecondary, fontSize: 13 }}>
                          {contato.cidade || '—'}
                        </td>
                        <td style={{ padding: '10px 8px', color: colors.textSecondary, fontSize: 13 }}>
                          {contato.ultimo_contato
                            ? new Date(contato.ultimo_contato).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : '—'
                          }
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                          {contato.total_mensagens}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: contato.registrado ? 'rgba(34,197,94,0.15)' : 'rgba(156,163,175,0.15)',
                              color: contato.registrado ? '#22c55e' : '#9ca3af',
                            }}
                          >
                            {contato.registrado ? 'Registrado' : 'Nao reg.'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => deletarContato(contato.whatsapp_number, contato.nome)}
                            className="text-xs px-2 py-0.5 rounded transition-all hover:opacity-100"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', opacity: 0.6 }}
                            title="Apagar contato e histórico"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  {totalContatos} contatos no total
                </span>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="text-sm px-3 py-1.5 rounded disabled:opacity-30"
                      style={{ background: colors.hoverBg, color: colors.textPrimary }}
                    >
                      Anterior
                    </button>
                    <span className="text-sm py-1.5 px-2" style={{ color: colors.textSecondary }}>
                      {page}/{totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="text-sm px-3 py-1.5 rounded disabled:opacity-30"
                      style={{ background: colors.hoverBg, color: colors.textPrimary }}
                    >
                      Proxima
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Listas Panel */}
          {showListasPanel && (
            <div className="col-span-3">
              <div className="rounded-2xl p-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: colors.textPrimary }}>
                  Listas de Contatos
                </h3>

                {/* Create new list */}
                <div className="mb-4 p-3 rounded-lg" style={{ background: colors.hoverBg }}>
                  <input
                    type="text"
                    value={novaListaNome}
                    onChange={(e) => setNovaListaNome(e.target.value)}
                    placeholder="Nome da lista"
                    style={{ ...inputStyle, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={novaListaCor}
                      onChange={(e) => setNovaListaCor(e.target.value)}
                      style={{ width: 32, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    />
                    <button
                      onClick={criarLista}
                      disabled={!novaListaNome}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: colors.gradientButton }}
                    >
                      Criar Lista
                    </button>
                  </div>
                </div>

                {/* List of lists */}
                <div className="space-y-2">
                  {listas.map(lista => (
                    <div
                      key={lista.id}
                      className="p-3 rounded-lg flex justify-between items-center"
                      style={{ background: colors.hoverBg }}
                    >
                      <div className="flex items-center gap-2">
                        <div style={{
                          width: 12, height: 12, borderRadius: '50%',
                          background: lista.cor,
                        }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                            {lista.nome}
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {lista.total_membros} membros
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deletarLista(lista.id)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                      >
                        X
                      </button>
                    </div>
                  ))}

                  {listas.length === 0 && (
                    <p className="text-center text-xs py-4" style={{ color: colors.textSecondary }}>
                      Nenhuma lista criada
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== SEND TEMPLATE MODAL ==================== */}
      {sendModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: colors.modalOverlay }}>
          <div
            className="rounded-2xl p-6 w-full mx-4 overflow-y-auto"
            style={{
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              maxWidth: 560,
              maxHeight: '90vh',
            }}
          >
            <h2 className="text-xl font-bold mb-2" style={{ color: colors.textPrimary }}>
              Enviar Template em Massa
            </h2>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Enviar para {selectedContatos.size} contatos selecionados
              {selectedContatos.size > 50 && (
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                  {' '}(processamento em background via Celery)
                </span>
              )}
            </p>

            {/* Template selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
                Template Aprovado
              </label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => {
                  setSelectedTemplateId(Number(e.target.value) || null);
                  setParamValues({});
                  setMediaUrl('');
                  setCouponCode('');
                }}
                style={inputStyle}
              >
                <option value="">Selecione um template</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                ))}
              </select>
            </div>

            {/* Smart parameters - shown when template is selected */}
            {selectedTemplate && templateInfo && (
              <div className="space-y-4">
                {/* Template preview */}
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{ background: `${colors.primary}08`, border: `1px solid ${colors.primary}22` }}
                >
                  <p className="font-medium mb-1" style={{ color: colors.primary, fontSize: 11, textTransform: 'uppercase' }}>
                    Preview do template
                  </p>
                  <p style={{ color: colors.textPrimary, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                    {getTemplateBodyText(selectedTemplate)}
                  </p>
                </div>

                {/* Body Parameters */}
                {templateInfo.bodyParams.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                      Parametros do Template
                    </p>

                    {/* {{1}} - Special: contact name option */}
                    {templateInfo.bodyParams.includes('1') && (
                      <div
                        className="p-3 rounded-lg"
                        style={{ background: colors.hoverBg }}
                      >
                        <p className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
                          {'{{1}}'} - Primeiro parametro
                        </p>
                        <div className="flex gap-3 mb-2">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input
                              type="radio"
                              name="param1_mode"
                              checked={useContactName}
                              onChange={() => setUseContactName(true)}
                              style={{ accentColor: colors.primary }}
                            />
                            Usar nome do contato
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input
                              type="radio"
                              name="param1_mode"
                              checked={!useContactName}
                              onChange={() => setUseContactName(false)}
                              style={{ accentColor: colors.primary }}
                            />
                            Texto fixo para todos
                          </label>
                        </div>
                        {useContactName ? (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>
                              Fallback (quando nao tem nome):
                            </label>
                            <input
                              type="text"
                              value={fallbackName}
                              onChange={(e) => setFallbackName(e.target.value)}
                              placeholder="Ola"
                              style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }}
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={paramValues['1'] || ''}
                            onChange={(e) => setParamValues(prev => ({ ...prev, '1': e.target.value }))}
                            placeholder="Texto fixo para {{1}}"
                            style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }}
                          />
                        )}
                      </div>
                    )}

                    {/* {{2}}, {{3}}, etc. - manual input */}
                    {templateInfo.bodyParams.filter(p => p !== '1').map(param => (
                      <div key={param}>
                        <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          {`{{${param}}}`} - Parametro {param}
                        </label>
                        <input
                          type="text"
                          value={paramValues[param] || ''}
                          onChange={(e) => setParamValues(prev => ({ ...prev, [param]: e.target.value }))}
                          placeholder={`Valor para {{${param}}}`}
                          style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Media upload for IMAGE/VIDEO/DOCUMENT headers */}
                {templateInfo.headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateInfo.headerFormat) && (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Midia do cabecalho ({templateInfo.headerFormat.toLowerCase()})
                    </label>
                    <div className="flex items-center gap-2">
                      <label
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm"
                        style={{
                          background: colors.inputBg,
                          border: `1px dashed ${mediaUrl ? colors.primary : colors.border}`,
                          color: colors.textSecondary,
                        }}
                      >
                        <span>{mediaUrl ? 'Trocar arquivo' : 'Carregar arquivo'}</span>
                        <input
                          type="file"
                          accept={
                            templateInfo.headerFormat === 'IMAGE' ? 'image/jpeg,image/png,image/webp' :
                            templateInfo.headerFormat === 'VIDEO' ? 'video/mp4' :
                            'application/pdf'
                          }
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 16 * 1024 * 1024) {
                              alert('Arquivo muito grande. Maximo 16MB.');
                              return;
                            }
                            try {
                              const result = await templatesApi.uploadMedia(file);
                              const baseUrl = process.env.REACT_APP_API_URL?.replace('/api/v1', '') || 'https://api.yoursystem.dev.br';
                              setMediaUrl(`${baseUrl}${result.url}`);
                            } catch (err: any) {
                              alert(err.response?.data?.detail || 'Erro ao fazer upload');
                            }
                          }}
                        />
                      </label>
                      {mediaUrl && (
                        <button
                          onClick={() => setMediaUrl('')}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    {mediaUrl && templateInfo.headerFormat === 'IMAGE' && (
                      <div style={{
                        marginTop: 6, borderRadius: 8, overflow: 'hidden', height: 80,
                        background: `url(${mediaUrl}) center/cover no-repeat`,
                        backgroundColor: colors.hoverBg, border: `1px solid ${colors.border}`,
                      }} />
                    )}
                  </div>
                )}

                {/* Coupon code for COPY_CODE button */}
                {templateInfo.hasCopyCode && (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Codigo do cupom (COPY_CODE)
                    </label>
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="CUPOM2024"
                      style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={enviarEmMassa}
                disabled={sending || !selectedTemplateId}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: colors.gradientButton }}
              >
                {sending ? 'Enviando...' : `Enviar para ${selectedContatos.size}`}
              </button>
              <button
                onClick={() => setSendModal(false)}
                className="px-4 py-2.5 rounded-lg font-semibold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CSV IMPORT MODAL ==================== */}
      {importModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: colors.modalOverlay }}>
          <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
            <h2 className="text-xl font-bold mb-2" style={{ color: colors.textPrimary }}>
              Importar CSV
            </h2>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Importe contatos de um arquivo CSV. Colunas aceitas: whatsapp_number (obrigatorio), nome, cidade, cpf
            </p>

            {/* Optional: add to list */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
                Adicionar a uma lista (opcional)
              </label>
              <select
                value={importListaId || ''}
                onChange={(e) => setImportListaId(Number(e.target.value) || null)}
                style={inputStyle}
              >
                <option value="">Nenhuma lista</option>
                {listas.map(l => (
                  <option key={l.id} value={l.id}>{l.nome} ({l.total_membros} membros)</option>
                ))}
              </select>
            </div>

            {/* File input */}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importarCSV(file);
              }}
            />

            <div className="flex gap-3">
              <button
                onClick={() => csvInputRef.current?.click()}
                disabled={importing}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: colors.gradientButton }}
              >
                {importing ? 'Importando...' : 'Selecionar Arquivo CSV'}
              </button>
              <button
                onClick={() => { setImportModal(false); setImportListaId(null); }}
                className="px-4 py-2.5 rounded-lg font-semibold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              >
                Cancelar
              </button>
            </div>

            {/* CSV format hint */}
            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: colors.hoverBg, color: colors.textSecondary }}>
              <p className="font-semibold mb-1">Formato do CSV:</p>
              <code style={{ fontSize: 11 }}>
                whatsapp_number,nome,cidade<br />
                5511999998888,Joao Silva,Sao Paulo<br />
                5521988887777,Maria Santos,Rio de Janeiro
              </code>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADD TO LIST MODAL ==================== */}
      {addToListModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: colors.modalOverlay }}>
          <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={{ background: colors.cardBg, border: `1px solid ${colors.border}` }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: colors.textPrimary }}>
              Adicionar a Lista
            </h2>
            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Adicionar {selectedContatos.size} contatos a lista
            </p>
            <div className="mb-4">
              <select
                value={selectedListaId || ''}
                onChange={(e) => setSelectedListaId(Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Selecione uma lista</option>
                {listas.map(l => (
                  <option key={l.id} value={l.id}>{l.nome} ({l.total_membros} membros)</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={adicionarALista}
                disabled={!selectedListaId}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: colors.gradientButton }}
              >
                Adicionar
              </button>
              <button
                onClick={() => setAddToListModal(false)}
                className="px-4 py-2.5 rounded-lg font-semibold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
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

export default ContatosPage;
