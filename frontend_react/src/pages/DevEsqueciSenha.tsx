import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const DevEsqueciSenha: React.FC = () => {
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
      await api.post('/auth/dev/esqueci-senha', { email });
      setEnviado(true);
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box' as const,
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
        {!enviado ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔐</div>
              <h1 style={{ fontSize: '24px', color: '#1a1f3a', margin: 0 }}>Recuperar senha</h1>
              <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
                Portal do Desenvolvedor — informe seu email para receber o link
              </p>
            </div>

            {erro && (
              <div style={{
                background: '#fee2e2', color: '#dc2626', padding: '12px',
                borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
              }}>
                {erro}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="dev@example.com"
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
                {loading ? 'Enviando...' : 'Enviar instruções'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📧</div>
            <h2 style={{ fontSize: '20px', color: '#1a1f3a', marginBottom: '12px' }}>Verifique seu email</h2>
            <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.7', marginBottom: '8px' }}>
              Se o endereço <strong style={{ color: '#00d4ff' }}>{email}</strong> estiver cadastrado,
              você receberá um link para redefinir sua senha.
            </p>
            <p style={{ color: '#999', fontSize: '13px', marginBottom: '24px' }}>
              Não recebeu? Verifique a pasta de spam ou aguarde alguns minutos.
            </p>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link to="/dev/login" style={{ color: '#00d4ff', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DevEsqueciSenha;
