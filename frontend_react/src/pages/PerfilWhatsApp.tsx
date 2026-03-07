import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { perfilWhatsAppApi } from '../services/api';

const MAX_ABOUT = 139;
const MAX_DESC = 256;

// Cores do portfolio
const C = {
  bg: '#0a0e27',
  card: '#1a1f3a',
  cardBorder: 'rgba(0, 212, 255, 0.15)',
  gradient: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
  gradientSubtle: 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(123,44,191,0.12) 100%)',
  cyan: '#00d4ff',
  purple: '#7b2cbf',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.55)',
  inputBg: 'rgba(255,255,255,0.05)',
  inputBorder: 'rgba(0, 212, 255, 0.2)',
  inputBorderFocus: 'rgba(0, 212, 255, 0.6)',
};

const PerfilWhatsApp: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [categorias, setCategorias] = useState<{ value: string; label: string }[]>([]);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    about: '',
    address: '',
    description: '',
    email: '',
    vertical: '',
    website1: '',
    website2: '',
  });

  useEffect(() => { carregarPerfil(); }, []);

  const carregarPerfil = async () => {
    try {
      setLoading(true);
      setErro('');
      const { perfil, categorias: cats } = await perfilWhatsAppApi.obter();
      setCategorias(cats || []);
      const sites = perfil.websites || [];
      setForm({
        about: perfil.about || '',
        address: perfil.address || '',
        description: perfil.description || '',
        email: perfil.email || '',
        vertical: perfil.vertical || '',
        website1: sites[0] || '',
        website2: sites[1] || '',
      });
      if (perfil.profile_picture_url) setFotoPreview(perfil.profile_picture_url);
    } catch (e: any) {
      setErro(e?.response?.data?.detail || 'Erro ao carregar perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    try {
      setSaving(true);
      setErro('');
      setSucesso('');
      const websites: string[] = [];
      if (form.website1.trim()) websites.push(form.website1.trim());
      if (form.website2.trim()) websites.push(form.website2.trim());
      await perfilWhatsAppApi.atualizar({
        about: form.about || undefined,
        address: form.address || undefined,
        description: form.description || undefined,
        email: form.email || undefined,
        vertical: form.vertical || undefined,
        websites: websites.length > 0 ? websites : undefined,
      });
      setSucesso('Perfil atualizado com sucesso!');
      setTimeout(() => setSucesso(''), 4000);
    } catch (e: any) {
      setErro(e?.response?.data?.detail || 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    try {
      setSalvandoFoto(true);
      setErro('');
      await perfilWhatsAppApi.atualizarFoto(file);
      setSucesso('Foto de perfil atualizada!');
      setTimeout(() => setSucesso(''), 4000);
    } catch (e: any) {
      setErro(e?.response?.data?.detail || 'Erro ao atualizar foto.');
    } finally {
      setSalvandoFoto(false);
    }
  };

  const inp = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: `1px solid ${C.inputBorder}`,
    background: C.inputBg,
    color: C.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical' as const,
    minHeight: 80,
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: C.cyan,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  };

  const cardStyle: React.CSSProperties = {
    background: C.card,
    borderRadius: 16,
    padding: '28px 32px',
    marginBottom: 20,
    border: `1px solid ${C.cardBorder}`,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid rgba(0,212,255,0.2)`, borderTopColor: C.cyan, animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: C.textMuted, fontSize: 14 }}>Carregando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '0 0 40px' }}>

      {/* Banner header com gradiente */}
      <div style={{
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 60%, rgba(123,44,191,0.3) 100%)',
        borderBottom: `1px solid ${C.cardBorder}`,
        padding: '24px 24px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* glow decorativo */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/empresa/dashboard')}
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: C.textMuted, fontSize: 13, flexShrink: 0 }}
          >
            ← Voltar
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Perfil WhatsApp Business
            </h1>
            <p style={{ fontSize: 13, color: C.textMuted, margin: '3px 0 0' }}>
              Informações exibidas para seus clientes no WhatsApp
            </p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '24px auto 0', padding: '0 20px' }}>

        {/* Alertas */}
        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: 14 }}>
            ❌ {erro}
          </div>
        )}
        {sucesso && (
          <div style={{ background: 'rgba(0,212,255,0.1)', border: `1px solid rgba(0,212,255,0.3)`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: C.cyan, fontSize: 14 }}>
            ✅ {sucesso}
          </div>
        )}

        {/* Foto de perfil */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>📷</span>
            Foto de Perfil
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              onClick={() => fotoInputRef.current?.click()}
              style={{
                width: 100, height: 100, borderRadius: '50%',
                background: fotoPreview ? undefined : 'rgba(0,212,255,0.08)',
                backgroundImage: fotoPreview ? `url(${fotoPreview})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32,
                border: `2px solid transparent`,
                backgroundClip: 'padding-box',
                outline: `2px solid rgba(0,212,255,0.4)`,
                outlineOffset: 2,
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {!fotoPreview && <span style={{ fontSize: 36, opacity: 0.5 }}>📷</span>}
              {salvandoFoto && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: C.cyan, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>
            <div>
              <p style={{ fontSize: 14, color: C.text, margin: '0 0 6px', fontWeight: 500 }}>Clique na foto para alterar</p>
              <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
                JPEG ou PNG • Quadrada • 640×640px recomendado<br />Máximo 5MB
              </p>
            </div>
          </div>
          <input ref={fotoInputRef} type="file" accept="image/jpeg,image/png" onChange={handleFotoChange} style={{ display: 'none' }} />
        </div>

        {/* Informações do negócio */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 0, marginBottom: 24 }}>
            📋 Informações do Negócio
          </h2>

          <div style={{ display: 'grid', gap: 20 }}>

            {/* Sobre */}
            <div>
              <label style={labelStyle}>
                Sobre &nbsp;<span style={{ color: C.textMuted, fontWeight: 400, textTransform: 'none', fontSize: 11 }}>({form.about.length}/{MAX_ABOUT})</span>
              </label>
              <textarea style={textareaStyle} value={form.about} maxLength={MAX_ABOUT}
                placeholder="Ex: Atendemos de seg a sex, 8h às 18h..."
                onChange={e => inp('about', e.target.value)} rows={2} />
              <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
                Aparece logo abaixo do nome no perfil do WhatsApp
              </p>
            </div>

            {/* Descrição */}
            <div>
              <label style={labelStyle}>
                Descrição &nbsp;<span style={{ color: C.textMuted, fontWeight: 400, textTransform: 'none', fontSize: 11 }}>({form.description.length}/{MAX_DESC})</span>
              </label>
              <textarea style={textareaStyle} value={form.description} maxLength={MAX_DESC}
                placeholder="Descreva seu negócio, produtos e serviços..."
                onChange={e => inp('description', e.target.value)} rows={3} />
            </div>

            {/* Categoria */}
            <div>
              <label style={labelStyle}>Categoria do Negócio</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.vertical} onChange={e => inp('vertical', e.target.value)}>
                <option value="" style={{ background: C.card }}>— Selecione a categoria —</option>
                {categorias.map(c => (
                  <option key={c.value} value={c.value} style={{ background: C.card }}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Endereço + E-mail */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Endereço</label>
                <input type="text" style={inputStyle} value={form.address}
                  placeholder="Rua, número, cidade..."
                  onChange={e => inp('address', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>E-mail de Contato</label>
                <input type="email" style={inputStyle} value={form.email}
                  placeholder="contato@seusite.com"
                  onChange={e => inp('email', e.target.value)} />
              </div>
            </div>

            {/* Sites */}
            <div>
              <label style={labelStyle}>Sites (até 2)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="url" style={inputStyle} value={form.website1}
                  placeholder="https://seusite.com.br"
                  onChange={e => inp('website1', e.target.value)} />
                <input type="url" style={inputStyle} value={form.website2}
                  placeholder="https://instagram.com/seunegocio (opcional)"
                  onChange={e => inp('website2', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={() => navigate('/empresa/dashboard')}
            style={{ padding: '12px 24px', borderRadius: 10, border: `1px solid ${C.cardBorder}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 14 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            style={{
              padding: '12px 36px', borderRadius: 10, border: 'none',
              background: saving ? 'rgba(255,255,255,0.1)' : C.gradient,
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              opacity: saving ? 0.7 : 1,
              boxShadow: saving ? 'none' : '0 4px 20px rgba(0,212,255,0.25)',
            }}
          >
            {saving ? 'Salvando...' : '💾 Salvar Perfil'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PerfilWhatsApp;
