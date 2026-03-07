import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage, LangToggle } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import logo from '../assets/logo.jpg';

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

const LoginUnificado: React.FC = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const { loginEmpresa, loginAtendente } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      // Tenta login como empresa primeiro
      try {
        await loginEmpresa(email, senha);
        // Navegação já é feita pelo loginEmpresa (admin → /admin/painel, empresa → /empresa/dashboard)
        return;
      } catch (empresaError) {
        // Se falhar, tenta como atendente
        try {
          await loginAtendente(email, senha);
          // Navegação já é feita pelo loginAtendente
          return;
        } catch (atendenteError) {
          throw new Error(t('Email ou senha incorretos', 'Incorrect email or password'));
        }
      }
    } catch (error: any) {
      setErro(error.message || t('Email ou senha incorretos', 'Incorrect email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: `linear-gradient(135deg, ${P.bg} 0%, ${P.cardBg} 100%)` }}>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
        `}
      </style>

      {/* Lado esquerdo - Logo e Info */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-center items-center relative overflow-hidden">
        {/* Efeito de brilho animado */}
        <div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${P.primary}26 0%, transparent 70%)`,
            top: '-200px',
            right: '-200px',
            animation: 'pulse 4s ease-in-out infinite'
          }}
        ></div>
        <div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${P.secondary}26 0%, transparent 70%)`,
            bottom: '-200px',
            left: '-200px',
            animation: 'pulse 5s ease-in-out infinite'
          }}
        ></div>

        <div className="relative z-10 text-center">
          {/* Logo redondo com borda */}
          <div className="mb-8 flex justify-center">
            <div
              className="overflow-hidden"
              style={{
                width: '250px',
                height: '250px',
                borderRadius: '50%',
                border: `5px solid ${P.primary}`,
                boxShadow: `0 0 50px ${P.primary}66`,
                animation: 'float 3s ease-in-out infinite'
              }}
            >
              <img
                src={logo}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Titulo com gradiente */}
          <h1
            className="text-5xl font-bold mb-6 bg-clip-text"
            style={{
              backgroundImage: P.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              display: 'inline-block',
            }}
          >
            YOUR SYSTEM
          </h1>

          <p className="text-xl mb-8 max-w-md" style={{ color: P.textSecondary }}>
            {t('Sistema completo de gerenciamento de atendimento via WhatsApp', 'Complete WhatsApp customer service management system')}
          </p>

          {/* Features */}
          <div className="text-left space-y-3 max-w-md mb-12" style={{ color: P.textSecondary }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }}></div>
              <span>{t('Atendimento em tempo real', 'Real-time customer support')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }}></div>
              <span>{t('Bot inteligente integrado', 'Integrated smart bot')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }}></div>
              <span>{t('Dashboard completo', 'Complete dashboard')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }}></div>
              <span>{t('Multi-atendentes', 'Multi-agent support')}</span>
            </div>
          </div>

          {/* Redes Sociais */}
          <div className="flex gap-6 justify-center">
            <a
              href="https://wa.me/5575982055013"
              target="_blank"
              rel="noopener noreferrer"
              className="text-3xl transition-all hover:scale-110"
              style={{ color: `${P.textSecondary}b3` }}
              onMouseEnter={(e) => e.currentTarget.style.color = P.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = `${P.textSecondary}b3`}
              title="WhatsApp"
            >
              💬
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-3xl transition-all hover:scale-110"
              style={{ color: `${P.textSecondary}b3` }}
              onMouseEnter={(e) => e.currentTarget.style.color = P.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = `${P.textSecondary}b3`}
              title="Instagram"
            >
              📸
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-3xl transition-all hover:scale-110"
              style={{ color: `${P.textSecondary}b3` }}
              onMouseEnter={(e) => e.currentTarget.style.color = P.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = `${P.textSecondary}b3`}
              title="GitHub"
            >
              💻
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-3xl transition-all hover:scale-110"
              style={{ color: `${P.textSecondary}b3` }}
              onMouseEnter={(e) => e.currentTarget.style.color = P.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = `${P.textSecondary}b3`}
              title="LinkedIn"
            >
              💼
            </a>
          </div>
        </div>
      </div>

      {/* Lado direito - Formulario de Login */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Theme Toggle + Lang Toggle */}
          <div className="flex justify-end mb-4 gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>

          {/* Logo Mobile */}
          <div className="lg:hidden mb-8 flex justify-center">
            <div
              className="overflow-hidden"
              style={{
                width: '150px',
                height: '150px',
                borderRadius: '50%',
                border: `3px solid ${P.primary}`,
                boxShadow: `0 0 30px ${P.primary}4d`
              }}
            >
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{
              background: P.cardBg,
              boxShadow: `0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px ${P.primary}1a`
            }}
          >
            <h2 className="text-3xl font-bold mb-2 text-center" style={{ color: P.textPrimary }}>
              {t('Bem-vindo de volta', 'Welcome back')}
            </h2>
            <p className="text-center mb-8" style={{ color: P.textSecondary }}>
              {t('Entre com suas credenciais para acessar', 'Enter your credentials to access')}
            </p>

            {erro && (
              <div
                className="mb-6 p-4 rounded-lg text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5'
                }}
              >
                {erro}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: P.textSecondary }}>
                  {t('Email', 'Email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg outline-none transition-all"
                  style={{
                    background: P.inputBg,
                    border: `1px solid ${P.inputBorder}`,
                    color: P.textPrimary
                  }}
                  placeholder={t('seu@email.com', 'your@email.com')}
                  onFocus={(e) => e.target.style.borderColor = P.primary}
                  onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                />
              </div>

              <div>
                <label htmlFor="senha" className="block text-sm font-medium mb-2" style={{ color: P.textSecondary }}>
                  {t('Senha', 'Password')}
                </label>
                <input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg outline-none transition-all"
                  style={{
                    background: P.inputBg,
                    border: `1px solid ${P.inputBorder}`,
                    color: P.textPrimary
                  }}
                  placeholder="••••••••"
                  onFocus={(e) => e.target.style.borderColor = P.primary}
                  onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white py-3 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: P.gradient,
                  borderRadius: '50px',
                  boxShadow: `0 5px 15px ${P.primary}4d`
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 10px 25px ${P.primary}66`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 5px 15px ${P.primary}4d`;
                }}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>{t('Entrando...', 'Signing in...')}</span>
                  </div>
                ) : (
                  t('Entrar', 'Sign In')
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => navigate('/esqueci-senha')}
                style={{ background: 'none', border: 'none', color: P.textSecondary, cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
              >
                {t('Esqueceu sua senha?', 'Forgot your password?')}
              </button>
            </div>

            <div className="mt-4 text-center text-sm" style={{ color: P.textSecondary }}>
              {t('O sistema identifica automaticamente seu tipo de usuario', 'The system automatically identifies your user type')}
            </div>
          </div>

          {/* Link para Cadastro */}
          <div className="mt-6 text-center text-sm" style={{ color: P.textSecondary }}>
            {t('Não tem uma conta?', "Don't have an account?")}{' '}
            <button
              onClick={() => navigate('/cadastro')}
              style={{
                background: 'none',
                border: 'none',
                color: P.primary,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 'inherit',
                padding: 0,
              }}
            >
              {t('Cadastre-se', 'Sign Up')}
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm" style={{ color: P.textSecondary }}>
            <p>© 2026 YOUR SYSTEM. {t('Todos os direitos reservados.', 'All rights reserved.')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginUnificado;
