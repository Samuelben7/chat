import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const P = {
  primary: '#00d4ff',
  secondary: '#7b2cbf',
  bg: '#0a0e27',
  cardBg: '#1a1f3a',
  gradient: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
  textPrimary: '#ffffff',
  textSecondary: '#b8c1ec',
  inputBg: '#1a1f3a',
  inputBorder: 'rgba(0, 212, 255, 0.2)',
};

const EsqueciSenha: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      await api.post('/auth/esqueci-senha', { email });
      setEnviado(true);
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8"
      style={{ background: `linear-gradient(135deg, ${P.bg} 0%, ${P.cardBg} 100%)` }}>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
        `}
      </style>

      {/* Background glows */}
      <div className="fixed w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${P.primary}1a 0%, transparent 70%)`, top: '-100px', right: '-100px', animation: 'pulse 4s ease-in-out infinite' }} />
      <div className="fixed w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${P.secondary}1a 0%, transparent 70%)`, bottom: '-100px', left: '-100px', animation: 'pulse 5s ease-in-out infinite' }} />

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl p-8" style={{ background: P.cardBg, boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 0 1px ${P.primary}1a` }}>

          {!enviado ? (
            <>
              <div className="text-center mb-8">
                <div className="text-5xl mb-4">🔐</div>
                <h2 className="text-3xl font-bold mb-2" style={{ color: P.textPrimary }}>Esqueceu sua senha?</h2>
                <p className="text-sm" style={{ color: P.textSecondary }}>
                  Informe seu email e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              {erro && (
                <div className="mb-6 p-4 rounded-lg text-sm"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                  {erro}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: P.textSecondary }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg outline-none transition-all"
                    style={{ background: P.inputBg, border: `1px solid ${P.inputBorder}`, color: P.textPrimary }}
                    placeholder="seu@email.com"
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white py-3 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: P.gradient, borderRadius: '50px', boxShadow: `0 5px 15px ${P.primary}4d` }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Enviando...</span>
                    </div>
                  ) : 'Enviar instruções'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-6xl mb-6">📧</div>
              <h2 className="text-2xl font-bold mb-4" style={{ color: P.textPrimary }}>Verifique seu email</h2>
              <p className="text-sm mb-6" style={{ color: P.textSecondary, lineHeight: '1.7' }}>
                Se o endereço <strong style={{ color: P.primary }}>{email}</strong> estiver cadastrado,
                você receberá um link para redefinir sua senha em breve.
              </p>
              <p className="text-xs mb-8" style={{ color: P.textSecondary }}>
                Não recebeu? Verifique a pasta de spam ou aguarde alguns minutos.
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: P.primary, fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              ← Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsqueciSenha;
