import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DevLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { loginDev } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginDev(email, senha);
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#fff',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            fontSize: '40px',
            marginBottom: '10px',
          }}>{'</>'}</div>
          <h1 style={{ fontSize: '24px', color: '#1a1f3a', margin: 0 }}>Portal do Desenvolvedor</h1>
          <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
            Acesse sua conta para gerenciar API keys e uso
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#dc2626',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="dev@example.com"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#ccc' : 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: '#888', fontSize: '14px' }}>
            Nao tem conta?{' '}
            <Link to="/dev/cadastro" style={{ color: '#00d4ff', textDecoration: 'none', fontWeight: 600 }}>
              Cadastre-se
            </Link>
          </p>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '10px' }}>
            <Link to="/dev/esqueci-senha" style={{ color: '#888', textDecoration: 'underline' }}>
              Esqueceu sua senha?
            </Link>
          </p>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '10px' }}>
            <Link to="/login" style={{ color: '#7b2cbf', textDecoration: 'none' }}>
              Login para Empresas
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default DevLogin;
