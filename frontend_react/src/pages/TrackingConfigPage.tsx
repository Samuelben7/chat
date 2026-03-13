import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ─── Design Tokens (same as IAConfigPage) ─────────────────────────────────────
const C = {
  bg: '#0a0a0f',
  surface: '#111827',
  surfaceLight: 'rgba(255,255,255,0.05)',
  text: '#f4f4f5',
  textSec: '#a1a1aa',
  textMuted: '#71717a',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  blue: '#3b82f6',
  orange: '#f59e0b',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
};

const glass: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: C.textMuted, fontWeight: 600,
  textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block', marginBottom: 6,
};

const inputDark: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '10px 14px',
  color: C.text,
  fontSize: 13,
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box' as const,
};

interface TrackingConfig {
  meta_pixel_id: string;
  meta_capi_token: string;
  google_gtag_id: string;
  google_api_secret: string;
}

const TrackingConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<TrackingConfig>({
    meta_pixel_id: '',
    meta_capi_token: '',
    google_gtag_id: '',
    google_api_secret: '',
  });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const temMeta = !!(config.meta_pixel_id && config.meta_capi_token);
  const temGoogle = !!(config.google_gtag_id && config.google_api_secret);

  useEffect(() => {
    api.get('/auth/empresa/tracking-config')
      .then(r => setConfig(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const set = (campo: keyof TrackingConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConfig(prev => ({ ...prev, [campo]: e.target.value }));

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      await api.patch('/auth/empresa/tracking-config', config);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
      <div style={{ color: C.textSec, fontSize: 14 }}>Carregando...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes trk-orb-float {
          0%, 100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(30px,-20px) scale(1.05); }
          66% { transform: translate(-20px,15px) scale(0.95); }
        }
        .trk-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; opacity: 0.12; }
        .trk-input:focus { border-color: rgba(139,92,246,0.5) !important; box-shadow: 0 0 0 2px rgba(139,92,246,0.1); }
        .trk-input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>

      {/* Orbs */}
      <div className="trk-orb" style={{ width: 400, height: 400, top: -100, right: -80, background: '#1877f2', animation: 'trk-orb-float 20s ease-in-out infinite' }} />
      <div className="trk-orb" style={{ width: 300, height: 300, bottom: -60, left: -60, background: '#4285f4', animation: 'trk-orb-float 25s ease-in-out infinite reverse' }} />

      {/* Header */}
      <div style={{
        padding: '20px 28px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(17,24,39,0.8)', backdropFilter: 'blur(12px)',
        position: 'relative', zIndex: 2,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '8px 14px', color: C.textSec,
          cursor: 'pointer', fontSize: 16, transition: 'all 0.2s',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg, #1877f2, #4285f4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Tracking & Conversões
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
            Configure Meta Pixel CAPI e Google Ads para rastrear novos contatos via WhatsApp
          </p>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: temMeta ? 'rgba(24,119,242,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${temMeta ? 'rgba(24,119,242,0.4)' : C.border}`,
            color: temMeta ? '#1877f2' : C.textMuted,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: temMeta ? '#1877f2' : C.textMuted, boxShadow: temMeta ? '0 0 6px #1877f2' : 'none' }} />
            Meta {temMeta ? 'Ativo' : 'Inativo'}
          </div>
          <div style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: temGoogle ? 'rgba(66,133,244,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${temGoogle ? 'rgba(66,133,244,0.4)' : C.border}`,
            color: temGoogle ? '#4285f4' : C.textMuted,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: temGoogle ? '#4285f4' : C.textMuted, boxShadow: temGoogle ? '0 0 6px #4285f4' : 'none' }} />
            Google {temGoogle ? 'Ativo' : 'Inativo'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', zIndex: 2 }}>

        {/* Info banner */}
        <div style={{
          ...glass,
          padding: '14px 20px',
          border: '1px solid rgba(139,92,246,0.2)',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(6,182,212,0.04) 100%)',
        }}>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            <strong style={{ color: C.text }}>Como funciona:</strong> Quando um novo número envia a primeira mensagem para o seu WhatsApp,
            o sistema dispara automaticamente o evento de conversão para as plataformas configuradas.
            Configure apenas as plataformas que você usa — campos em branco são ignorados.
          </div>
        </div>

        {/* ── Meta Pixel ──────────────────────────────────────────────────────── */}
        <div style={{
          ...glass,
          padding: 28,
          border: temMeta ? '1px solid rgba(24,119,242,0.3)' : `1px solid ${C.border}`,
          background: temMeta
            ? 'linear-gradient(135deg, rgba(24,119,242,0.08) 0%, rgba(24,119,242,0.03) 100%)'
            : glass.background,
          transition: 'all 0.4s ease',
        }}>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #1877f2, #0a5cc7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, boxShadow: '0 4px 16px rgba(24,119,242,0.3)',
            }}>f</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                Meta Pixel — Conversions API
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                Dispara evento <code style={{ color: '#1877f2', background: 'rgba(24,119,242,0.12)', padding: '1px 6px', borderRadius: 4 }}>Lead</code> quando novo contato chega via WhatsApp
              </div>
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: temMeta ? 'rgba(24,119,242,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${temMeta ? 'rgba(24,119,242,0.35)' : C.border}`,
              color: temMeta ? '#1877f2' : C.textMuted,
            }}>
              {temMeta ? '● Configurado' : '○ Não configurado'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Pixel ID</label>
              <input
                className="trk-input"
                style={inputDark}
                placeholder="Ex: 1234567890123456"
                value={config.meta_pixel_id}
                onChange={set('meta_pixel_id')}
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                Encontrado em: Gerenciador de Eventos → Configurações
              </div>
            </div>
            <div>
              <label style={labelStyle}>Access Token (CAPI)</label>
              <input
                className="trk-input"
                style={inputDark}
                type="password"
                placeholder="EAAxxxxxxxxxxxxxxxx..."
                value={config.meta_capi_token}
                onChange={set('meta_capi_token')}
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                Gerenciador de Eventos → Configurações → API de Conversões
              </div>
            </div>
          </div>
        </div>

        {/* ── Google Ads ──────────────────────────────────────────────────────── */}
        <div style={{
          ...glass,
          padding: 28,
          border: temGoogle ? '1px solid rgba(66,133,244,0.3)' : `1px solid ${C.border}`,
          background: temGoogle
            ? 'linear-gradient(135deg, rgba(66,133,244,0.08) 0%, rgba(52,168,83,0.03) 100%)'
            : glass.background,
          transition: 'all 0.4s ease',
        }}>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #4285f4, #34a853)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 900, color: 'white',
              boxShadow: '0 4px 16px rgba(66,133,244,0.3)',
            }}>G</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                Google Analytics 4 — Measurement Protocol
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                Dispara evento <code style={{ color: '#4285f4', background: 'rgba(66,133,244,0.12)', padding: '1px 6px', borderRadius: 4 }}>generate_lead</code> — importável como conversão no Google Ads
              </div>
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: temGoogle ? 'rgba(66,133,244,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${temGoogle ? 'rgba(66,133,244,0.35)' : C.border}`,
              color: temGoogle ? '#4285f4' : C.textMuted,
            }}>
              {temGoogle ? '● Configurado' : '○ Não configurado'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>ID de Medição GA4</label>
              <input
                className="trk-input"
                style={inputDark}
                placeholder="Ex: G-XXXXXXXXXX"
                value={config.google_gtag_id}
                onChange={set('google_gtag_id')}
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                GA4 → Admin → Fluxos de dados → ID de medição
              </div>
            </div>
            <div>
              <label style={labelStyle}>API Secret (Measurement Protocol)</label>
              <input
                className="trk-input"
                style={inputDark}
                type="password"
                placeholder="API secret do Measurement Protocol"
                value={config.google_api_secret}
                onChange={set('google_api_secret')}
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                GA4 → Admin → Fluxos de dados → Measurement Protocol API secrets
              </div>
            </div>
          </div>

          {/* Note about Google Ads import */}
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(66,133,244,0.06)', border: '1px solid rgba(66,133,244,0.15)',
            fontSize: 12, color: C.textMuted, lineHeight: 1.5,
          }}>
            <strong style={{ color: C.textSec }}>Como importar para Google Ads:</strong> No Google Ads → Conversões → Importar → Google Analytics 4 → selecione o evento <em>generate_lead</em>.
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
          {salvo && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10,
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
              color: C.emerald, fontSize: 13, fontWeight: 600,
            }}>
              ✓ Configurações salvas
            </div>
          )}
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              background: salvando ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              border: 'none', borderRadius: 10, padding: '11px 28px',
              color: 'white', fontSize: 14, fontWeight: 700,
              cursor: salvando ? 'not-allowed' : 'pointer',
              boxShadow: salvando ? 'none' : '0 4px 20px rgba(139,92,246,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackingConfigPage;
