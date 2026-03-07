import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import logo from '../assets/logo.jpg';

const API_URL = process.env.REACT_APP_API_URL;

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

interface FormData {
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  senha: string;
  confirmarSenha: string;
}

const CadastroEmpresa: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresaEmail, setEmpresaEmail] = useState('');

  const [formData, setFormData] = useState<FormData>({
    nome: '',
    cnpj: '',
    email: '',
    telefone: '',
    senha: '',
    confirmarSenha: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const formatCNPJ = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 18);
  };

  const formatTelefone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 15);
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setFormData({ ...formData, cnpj: formatted });
  };

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatTelefone(e.target.value);
    setFormData({ ...formData, telefone: formatted });
  };

  const validateForm = (): boolean => {
    if (!formData.nome.trim()) {
      setError('Nome da empresa é obrigatório');
      return false;
    }

    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Email inválido');
      return false;
    }

    if (formData.senha.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return false;
    }

    if (formData.senha !== formData.confirmarSenha) {
      setError('As senhas não coincidem');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/auth/empresa/register`, {
        nome: formData.nome,
        cnpj: formData.cnpj || null,
        email: formData.email,
        telefone: formData.telefone || null,
        senha: formData.senha,
      });

      setEmpresaEmail(formData.email);
      setStep(2);
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Erro ao cadastrar empresa. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    outline: 'none',
    transition: 'all 0.3s',
    background: P.inputBg,
    border: `1px solid ${P.inputBorder}`,
    color: P.textPrimary,
    fontSize: '14px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: P.textSecondary,
    marginBottom: '6px',
  };

  const renderStep1 = () => (
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
      <div className="hidden lg:flex lg:w-5/12 p-12 flex-col justify-center items-center relative overflow-hidden">
        <div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${P.primary}26 0%, transparent 70%)`,
            top: '-200px',
            right: '-200px',
            animation: 'pulse 4s ease-in-out infinite'
          }}
        />
        <div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${P.secondary}26 0%, transparent 70%)`,
            bottom: '-200px',
            left: '-200px',
            animation: 'pulse 5s ease-in-out infinite'
          }}
        />

        <div className="relative z-10 text-center">
          <div className="mb-8 flex justify-center">
            <div
              className="overflow-hidden"
              style={{
                width: '200px',
                height: '200px',
                borderRadius: '50%',
                border: `4px solid ${P.primary}`,
                boxShadow: `0 0 40px ${P.primary}66`,
                animation: 'float 3s ease-in-out infinite'
              }}
            >
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <h1
            className="text-4xl font-bold mb-4 bg-clip-text"
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

          <p className="text-lg mb-6 max-w-sm" style={{ color: P.textSecondary }}>
            Crie sua conta e comece a automatizar seu atendimento
          </p>

          <div className="text-left space-y-3 max-w-sm" style={{ color: P.textSecondary }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }} />
              <span>Configuração rápida e fácil</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }} />
              <span>Bot inteligente incluso</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: P.primary }} />
              <span>Suporte dedicado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lado direito - Formulário */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-lg">
          {/* Theme Toggle */}
          <div className="flex justify-end mb-3">
            <ThemeToggle />
          </div>

          {/* Logo Mobile */}
          <div className="lg:hidden mb-6 flex justify-center">
            <div
              className="overflow-hidden"
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                border: `3px solid ${P.primary}`,
                boxShadow: `0 0 25px ${P.primary}4d`
              }}
            >
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <div
            className="rounded-2xl p-6 lg:p-8"
            style={{
              background: P.cardBg,
              boxShadow: `0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px ${P.primary}1a`
            }}
          >
            <h2 className="text-2xl font-bold mb-1 text-center" style={{ color: P.textPrimary }}>
              Cadastre sua Empresa
            </h2>
            <p className="text-center mb-6 text-sm" style={{ color: P.textSecondary }}>
              Preencha os dados para criar sua conta
            </p>

            {error && (
              <div
                className="mb-4 p-3 rounded-lg text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5'
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Row 1: Nome + CNPJ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label style={labelStyle}>
                    <span>🏢</span> Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    placeholder="Minha Empresa LTDA"
                    required
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    <span>🪪</span> CNPJ (opcional)
                  </label>
                  <input
                    type="text"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleCNPJChange}
                    placeholder="00.000.000/0000-00"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
              </div>

              {/* Row 2: Email + Telefone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label style={labelStyle}>
                    <span>📧</span> Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="contato@empresa.com"
                    required
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    <span>📱</span> Telefone (opcional)
                  </label>
                  <input
                    type="tel"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleTelefoneChange}
                    placeholder="(00) 00000-0000"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
              </div>

              {/* Row 3: Senha + Confirmar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label style={labelStyle}>
                    <span>🔒</span> Senha *
                  </label>
                  <input
                    type="password"
                    name="senha"
                    value={formData.senha}
                    onChange={handleChange}
                    placeholder="Min. 6 caracteres"
                    required
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    <span>🔐</span> Confirmar Senha *
                  </label>
                  <input
                    type="password"
                    name="confirmarSenha"
                    value={formData.confirmarSenha}
                    onChange={handleChange}
                    placeholder="Repita a senha"
                    required
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = P.primary}
                    onBlur={(e) => e.target.style.borderColor = P.inputBorder}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white py-3 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: P.gradient,
                  borderRadius: '50px',
                  border: 'none',
                  boxShadow: `0 5px 15px ${P.primary}4d`,
                  cursor: loading ? 'not-allowed' : 'pointer',
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
                    <span>Cadastrando...</span>
                  </div>
                ) : (
                  'Criar Conta'
                )}
              </button>
            </form>

            <div className="mt-5 text-center text-sm" style={{ color: P.textSecondary }}>
              Já tem uma conta?{' '}
              <button
                onClick={() => navigate('/login')}
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
                Fazer Login
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-sm" style={{ color: P.textSecondary }}>
            <p>&copy; 2026 YOUR SYSTEM. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: `linear-gradient(135deg, ${P.bg} 0%, ${P.cardBg} 100%)` }}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>

        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: P.cardBg,
            boxShadow: `0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px ${P.primary}1a`
          }}
        >
          <div className="text-6xl mb-4">📧</div>

          <h2 className="text-2xl font-bold mb-2" style={{ color: P.textPrimary }}>
            Confirme seu Email
          </h2>
          <p className="mb-2 text-sm" style={{ color: P.textSecondary }}>
            Enviamos um link de confirmação para:
          </p>
          <p
            className="text-lg font-semibold mb-8 bg-clip-text"
            style={{
              backgroundImage: P.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              display: 'inline-block',
            }}
          >
            {empresaEmail}
          </p>

          <div className="text-left space-y-5 mb-8">
            {[
              { num: '1', text: 'Acesse sua caixa de entrada' },
              { num: '2', text: 'Clique no link de confirmação' },
              { num: '3', text: 'Faça login com suas credenciais' },
            ].map((item) => (
              <div key={item.num} className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ background: P.gradient }}
                >
                  {item.num}
                </div>
                <p style={{ color: P.textPrimary, margin: 0 }}>{item.text}</p>
              </div>
            ))}
          </div>

          <div
            className="p-4 rounded-lg mb-6 text-left text-sm"
            style={{
              background: `${P.primary}10`,
              borderLeft: `4px solid ${P.primary}`,
            }}
          >
            <p style={{ color: P.textSecondary, margin: '4px 0' }}>
              📌 <strong style={{ color: P.textPrimary }}>Importante:</strong> O link expira em 24 horas.
            </p>
            <p style={{ color: P.textSecondary, margin: '4px 0' }}>
              📁 Não recebeu? Verifique a pasta de spam.
            </p>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full text-white py-3 font-semibold transition-all"
            style={{
              background: P.gradient,
              borderRadius: '50px',
              border: 'none',
              boxShadow: `0 5px 15px ${P.primary}4d`,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 10px 25px ${P.primary}66`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 5px 15px ${P.primary}4d`;
            }}
          >
            Ir para Login
          </button>
        </div>
      </div>
    </div>
  );

  return step === 1 ? renderStep1() : renderStep2();
};

export default CadastroEmpresa;
