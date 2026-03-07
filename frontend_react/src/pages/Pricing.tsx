import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { planosApi } from '../services/devApi';
import logoImg from '../assets/logo.png';

interface Plano {
  id: number;
  tipo: string;
  nome: string;
  preco_mensal: number;
  descricao: string | null;
  features: string[];
  limites: Record<string, number>;
  ativo: boolean;
  ordem: number;
}

// Partículas de estrela animadas
const Stars: React.FC = () => {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.5,
    delay: Math.random() * 4,
    duration: Math.random() * 3 + 2,
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: `${s.x}%`,
          top: `${s.y}%`,
          width: s.size,
          height: s.size,
          borderRadius: '50%',
          background: '#fff',
          opacity: 0,
          animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
      <style>{`
        html, body { overflow-x: hidden; max-width: 100vw; background: #060b1f; margin: 0; }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
        @keyframes float-up {
          0% { opacity: 0; transform: translateY(40px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3); }
          50% { box-shadow: 0 0 50px rgba(0, 212, 255, 0.7), 0 0 80px rgba(123, 44, 191, 0.4); }
        }
        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes gradient-move {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .pricing-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .pricing-card:hover {
          transform: translateY(-8px) !important;
        }
        .pricing-card-featured:hover {
          transform: translateY(-8px) scale(1.02) !important;
        }
        .btn-cta {
          transition: all 0.25s ease;
        }
        .btn-cta:hover {
          filter: brightness(1.15);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 212, 255, 0.4);
        }
        .nav-link {
          transition: all 0.2s ease;
        }
        .nav-link:hover {
          background: rgba(0, 212, 255, 0.1) !important;
          border-color: rgba(0, 212, 255, 0.5) !important;
          color: #00d4ff !important;
        }
      `}</style>
    </div>
  );
};

const CheckIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="8" fill="rgba(0, 212, 255, 0.15)" />
    <path d="M4.5 8L7 10.5L11.5 6" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StarIcon: React.FC<{ filled?: boolean }> = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill={filled ? '#FFD700' : 'none'} stroke="#FFD700" strokeWidth="1.2">
    <polygon points="7,1 8.8,5.3 13.5,5.7 10,8.8 11.1,13.3 7,10.8 2.9,13.3 4,8.8 0.5,5.7 5.2,5.3" />
  </svg>
);

const planColors = [
  { bg: 'linear-gradient(135deg, #1e3a5f 0%, #0d1f3c 100%)', accent: '#4da6ff', border: 'rgba(77, 166, 255, 0.3)' },
  { bg: 'linear-gradient(135deg, #1a0e3a 0%, #0d0820 100%)', accent: '#a855f7', border: 'rgba(168, 85, 247, 0.4)' },
  { bg: 'linear-gradient(135deg, #1a2a1a 0%, #0d1a0d 100%)', accent: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
];

const featuredIndex = 1; // Plano do meio em destaque

const Pricing: React.FC = () => {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'empresa' | 'dev'>('empresa');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await planosApi.listar();
        setPlanos(data);
      } catch { /* fallback */ }
      setLoading(false);
    };
    load();
  }, []);

  const planosEmpresa = planos.filter(p => p.tipo === 'empresa').sort((a, b) => a.ordem - b.ordem);
  const planosDev = planos.filter(p => p.tipo === 'dev').sort((a, b) => a.ordem - b.ordem);
  const planosAtivos = activeTab === 'empresa' ? planosEmpresa : planosDev;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #060b1f 0%, #0d1533 40%, #0a0d26 70%, #060b1f 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflowX: 'hidden',
    }}>
      <Stars />

      {/* Glows de fundo */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 212, 255, 0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '-20%', right: '-10%',
        width: '700px', height: '700px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(123, 44, 191, 0.07) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ===== NAVBAR ===== */}
      <header style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 10,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        background: 'rgba(6, 11, 31, 0.5)',
      }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            overflow: 'hidden', border: '2px solid rgba(0,212,255,0.4)',
            boxShadow: '0 0 15px rgba(0,212,255,0.2)',
          }}>
            <img src={logoImg} alt="YourSystem" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px' }}>
            Your<span style={{ color: '#00d4ff' }}>System</span>
          </span>
        </Link>

        <nav style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link to="/login" className="nav-link" style={{
            color: '#b8c1ec', textDecoration: 'none', padding: '9px 20px',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
            fontSize: '14px', fontWeight: 500,
          }}>
            Login Empresa
          </Link>
          <Link to="/dev/login" className="nav-link" style={{
            color: '#00d4ff', textDecoration: 'none', padding: '9px 20px',
            border: '1px solid rgba(0,212,255,0.3)', borderRadius: '8px',
            fontSize: '14px', fontWeight: 600,
          }}>
            Login Dev
          </Link>
          <Link to="/dev/cadastro" style={{
            color: '#fff', textDecoration: 'none', padding: '9px 20px',
            background: 'linear-gradient(135deg, #00b4d8, #7b2cbf)',
            borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            boxShadow: '0 4px 15px rgba(0,180,216,0.3)',
          }} className="btn-cta">
            Comecar gratis
          </Link>
        </nav>
      </header>

      {/* ===== HERO ===== */}
      <section style={{
        textAlign: 'center',
        padding: '80px 20px 50px',
        position: 'relative',
        zIndex: 1,
        animation: 'float-up 0.8s ease forwards',
      }}>
        {/* Badge topo */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(0, 212, 255, 0.08)',
          border: '1px solid rgba(0, 212, 255, 0.2)',
          borderRadius: '50px', padding: '6px 16px', marginBottom: '28px',
          animation: 'badge-pulse 3s ease-in-out infinite',
        }}>
          <StarIcon filled />
          <span style={{ color: '#00d4ff', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>
            PLANOS E PRECOS
          </span>
          <StarIcon filled />
        </div>

        <h1 style={{
          color: '#fff',
          fontSize: 'clamp(36px, 6vw, 58px)',
          fontWeight: 800,
          margin: '0 0 20px',
          lineHeight: 1.1,
          letterSpacing: '-1px',
        }}>
          Simples, transparente{' '}
          <span style={{
            background: 'linear-gradient(135deg, #00d4ff, #7b2cbf)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            e justo
          </span>
        </h1>

        <p style={{
          color: '#8892b0',
          fontSize: '18px',
          maxWidth: '560px',
          margin: '0 auto 48px',
          lineHeight: 1.7,
        }}>
          Escolha o plano ideal para o seu negocio. Para empresas que precisam de CRM completo
          ou para devs que querem API direta ao WhatsApp.
        </p>

        {/* Toggle Empresa / Dev */}
        <div style={{
          display: 'inline-flex',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '4px',
          gap: '4px',
        }}>
          {(['empresa', 'dev'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 28px',
                borderRadius: '9px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.25s ease',
                background: activeTab === tab
                  ? 'linear-gradient(135deg, #00b4d8, #7b2cbf)'
                  : 'transparent',
                color: activeTab === tab ? '#fff' : '#8892b0',
                boxShadow: activeTab === tab ? '0 4px 15px rgba(0,180,216,0.3)' : 'none',
              }}
            >
              {tab === 'empresa' ? '🏢 Para Empresas' : '</> Para Devs'}
            </button>
          ))}
        </div>
      </section>

      {/* ===== CARDS ===== */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#8892b0', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-block', width: '40px', height: '40px',
            border: '3px solid rgba(0,212,255,0.2)', borderTopColor: '#00d4ff',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        </div>
      ) : (
        <section style={{
          maxWidth: '1180px',
          margin: '0 auto',
          padding: '0 24px 80px',
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
          gap: '24px',
          alignItems: 'center',
        }}>
          {planosAtivos.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1', textAlign: 'center',
              color: '#8892b0', padding: '60px',
              background: 'rgba(255,255,255,0.03)', borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              Nenhum plano disponivel no momento.
            </div>
          ) : (
            planosAtivos.map((plano, i) => {
              const isFeatured = i === featuredIndex && planosAtivos.length > 1;
              const color = planColors[i % planColors.length];
              return (
                <div
                  key={plano.id}
                  className={isFeatured ? 'pricing-card pricing-card-featured' : 'pricing-card'}
                  style={{
                    background: isFeatured
                      ? 'linear-gradient(160deg, #0f1e3a 0%, #16103a 100%)'
                      : 'rgba(255,255,255,0.03)',
                    borderRadius: '24px',
                    border: `1px solid ${isFeatured ? 'rgba(0, 212, 255, 0.4)' : color.border}`,
                    overflow: 'hidden',
                    position: 'relative',
                    transform: isFeatured ? 'scale(1.04)' : 'none',
                    boxShadow: isFeatured
                      ? '0 0 40px rgba(0, 212, 255, 0.15), 0 20px 60px rgba(0,0,0,0.4)'
                      : '0 10px 40px rgba(0,0,0,0.3)',
                    animation: isFeatured ? 'pulse-glow 4s ease-in-out infinite' : 'none',
                  }}
                >
                  {/* Badge Popular */}
                  {isFeatured && (
                    <div style={{
                      position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #00b4d8, #7b2cbf)',
                      color: '#fff', fontSize: '11px', fontWeight: 700,
                      padding: '5px 20px', borderRadius: '0 0 12px 12px',
                      letterSpacing: '1px', textTransform: 'uppercase',
                      boxShadow: '0 4px 20px rgba(0,180,216,0.4)',
                    }}>
                      ⭐ Mais Popular
                    </div>
                  )}

                  {/* Glow de cor no canto */}
                  <div style={{
                    position: 'absolute', top: '-40px', right: '-40px',
                    width: '160px', height: '160px', borderRadius: '50%',
                    background: `radial-gradient(circle, ${color.accent}20 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />

                  {/* Header do card */}
                  <div style={{ padding: isFeatured ? '36px 30px 24px' : '28px 30px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div style={{
                        width: '38px', height: '38px', borderRadius: '10px',
                        background: `${color.accent}20`,
                        border: `1px solid ${color.accent}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px',
                      }}>
                        {activeTab === 'dev' ? '</>' : i === 0 ? '🚀' : i === 1 ? '⚡' : '🏆'}
                      </div>
                      <div>
                        <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: 0 }}>
                          {plano.nome}
                        </h3>
                        {plano.descricao && (
                          <p style={{ color: '#8892b0', fontSize: '12px', margin: '2px 0 0' }}>
                            {plano.descricao}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Estrelas de rating */}
                    <div style={{ display: 'flex', gap: '3px', marginBottom: '20px' }}>
                      {[1,2,3,4,5].map(s => (
                        <StarIcon key={s} filled={s <= (i === 0 ? 3 : i === 1 ? 4 : 5)} />
                      ))}
                    </div>

                    {/* Preço */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                      <span style={{ color: '#8892b0', fontSize: '14px', marginBottom: '8px' }}>R$</span>
                      <span style={{
                        fontSize: isFeatured ? '56px' : '48px',
                        fontWeight: 800,
                        lineHeight: 1,
                        background: isFeatured
                          ? 'linear-gradient(135deg, #00d4ff, #a855f7)'
                          : `linear-gradient(135deg, ${color.accent}, #fff)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                        {Math.floor(plano.preco_mensal)}
                      </span>
                      <span style={{ color: '#8892b0', fontSize: '14px', marginBottom: '8px' }}>/mes</span>
                    </div>

                    {activeTab === 'dev' && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                        borderRadius: '6px', padding: '4px 10px', marginBottom: '4px',
                      }}>
                        <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                          ✓ 15 dias gratis — sem cartao
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Divisor */}
                  <div style={{
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${color.accent}40, transparent)`,
                    margin: '0 30px',
                  }} />

                  {/* Features */}
                  <div style={{ padding: '24px 30px' }}>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
                      {plano.features.map((feature, idx) => (
                        <li key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '8px 0',
                          borderBottom: idx < plano.features.length - 1
                            ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          color: '#ccd6f6',
                          fontSize: '14px',
                          lineHeight: 1.4,
                        }}>
                          <CheckIcon />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Limites */}
                    {Object.keys(plano.limites).length > 0 && (
                      <div style={{
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        marginBottom: '24px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {plano.limites.mensagens_mes && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#8892b0', fontSize: '12px' }}>Mensagens/mes</span>
                            <span style={{ color: color.accent, fontSize: '12px', fontWeight: 700 }}>
                              {plano.limites.mensagens_mes.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        )}
                        {plano.limites.requests_min && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#8892b0', fontSize: '12px' }}>Requests/min</span>
                            <span style={{ color: color.accent, fontSize: '12px', fontWeight: 700 }}>
                              {plano.limites.requests_min}
                            </span>
                          </div>
                        )}
                        {plano.limites.atendentes && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#8892b0', fontSize: '12px' }}>Atendentes</span>
                            <span style={{ color: color.accent, fontSize: '12px', fontWeight: 700 }}>
                              {plano.limites.atendentes === 999 ? 'Ilimitado' : plano.limites.atendentes}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CTA Button */}
                    <Link
                      to={activeTab === 'dev' ? '/dev/cadastro' : '/cadastro'}
                      className="btn-cta"
                      style={{
                        display: 'block',
                        textAlign: 'center',
                        padding: '14px 20px',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '15px',
                        color: '#fff',
                        background: isFeatured
                          ? 'linear-gradient(135deg, #00b4d8 0%, #7b2cbf 100%)'
                          : `linear-gradient(135deg, ${color.accent}cc, ${color.accent}66)`,
                        border: isFeatured ? 'none' : `1px solid ${color.accent}50`,
                        letterSpacing: '0.3px',
                      }}
                    >
                      {activeTab === 'dev'
                        ? (isFeatured ? '⚡ Comecar trial gratis' : 'Comecar trial gratis')
                        : (isFeatured ? '🚀 Assinar agora' : 'Comecar agora')
                      }
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* ===== SEÇÃO DE GARANTIAS ===== */}
      <section style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0 24px 80px',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
        }}>
          {[
            { icon: '🔒', title: 'Sem fidelidade', desc: 'Cancele quando quiser, sem multa ou burocracia.' },
            { icon: '🚀', title: 'Setup em minutos', desc: 'Conecte seu WhatsApp e comece a usar agora.' },
            { icon: '💬', title: 'Suporte real', desc: 'Atendimento humano para ajudar no que precisar.' },
          ].map((item, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '16px',
              padding: '24px',
              textAlign: 'center',
              transition: 'all 0.3s ease',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{item.icon}</div>
              <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 8px' }}>
                {item.title}
              </h4>
              <p style={{ color: '#8892b0', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '0 24px 100px',
        position: 'relative',
        zIndex: 1,
      }}>
        <h2 style={{
          textAlign: 'center', color: '#fff', fontSize: '28px',
          fontWeight: 700, marginBottom: '40px', letterSpacing: '-0.5px',
        }}>
          Duvidas frequentes
        </h2>
        {[
          { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Nao ha fidelidade. Cancele quando quiser direto no painel.' },
          { q: 'O trial de devs precisa de cartao?', a: 'Nao. 15 dias 100% gratis, sem precisar cadastrar forma de pagamento.' },
          { q: 'Qual a diferenca entre Empresa e Dev?', a: 'Planos Empresa dao acesso ao CRM completo, bot, atendimento e agendamento. Planos Dev dao acesso API direta ao WhatsApp com gateway de alta performance.' },
          { q: 'O pagamento e seguro?', a: 'Sim. Processamos via Mercado Pago com criptografia de ponta a ponta. Cartao tokenizado pelo MercadoPago.js (PCI-compliant).' },
        ].map((item, i) => (
          <details key={i} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            marginBottom: '12px',
            overflow: 'hidden',
          }}>
            <summary style={{
              padding: '18px 20px',
              cursor: 'pointer',
              color: '#ccd6f6',
              fontSize: '15px',
              fontWeight: 600,
              userSelect: 'none',
              listStyle: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              {item.q}
              <span style={{ color: '#00d4ff', fontSize: '20px', lineHeight: 1 }}>+</span>
            </summary>
            <p style={{
              color: '#8892b0', fontSize: '14px', lineHeight: 1.7,
              margin: 0, padding: '0 20px 18px',
            }}>
              {item.a}
            </p>
          </details>
        ))}
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '40px 24px',
        position: 'relative',
        zIndex: 1,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          maxWidth: '1180px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden',
              border: '1px solid rgba(0,212,255,0.3)',
            }}>
              <img src={logoImg} alt="YourSystem" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ color: '#8892b0', fontSize: '14px' }}>
              © 2026 <strong style={{ color: '#ccd6f6' }}>YourSystem</strong>. Todos os direitos reservados.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <Link to="/login" style={{ color: '#8892b0', fontSize: '13px', textDecoration: 'none' }}>
              Login Empresa
            </Link>
            <Link to="/dev/login" style={{ color: '#8892b0', fontSize: '13px', textDecoration: 'none' }}>
              Login Dev
            </Link>
            <Link to="/dev/cadastro" style={{ color: '#00d4ff', fontSize: '13px', textDecoration: 'none' }}>
              Comecar gratis
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
