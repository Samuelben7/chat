import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const DevRedefinirSenha: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (novaSenha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (!token) {
      setErro('Token inválido. Solicite uma nova recuperação de senha.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/dev/redefinir-senha', { token, nova_senha: novaSenha });
      setSucesso(true);
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao redefinir senha. O link pode ter expirado.');
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
        {!sucesso ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔑</div>
              <h1 style={{ fontSize: '24px', color: '#1a1f3a', margin: 0 }}>Nova senha</h1>
              <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
                Portal do Desenvolvedor — defina sua nova senha
              </p>
            </div>

            {!token && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
                Link inválido. Solicite uma nova recuperação de senha.
              </div>
            )}

            {erro && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
                {erro}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                  Nova senha
                </label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  minLength={6}
                  style={inputStyle}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Repita a nova senha"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: (loading || !token) ? '#ccc' : 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: (loading || !token) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontSize: '20px', color: '#1a1f3a', marginBottom: '12px' }}>Senha redefinida!</h2>
            <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.7', marginBottom: '24px' }}>
              Sua senha foi alterada com sucesso. Agora você pode fazer login com a nova senha.
            </p>
            <button
              onClick={() => navigate('/dev/login')}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Ir para o login
            </button>
          </div>
        )}

        {!sucesso && (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <Link to="/dev/login" style={{ color: '#00d4ff', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
              ← Voltar para o login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevRedefinirSenha;
