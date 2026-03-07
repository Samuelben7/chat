import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const DevConfirmarEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMensagem('Token inválido ou não encontrado. Verifique o link no seu email.');
      return;
    }

    api.post('/auth/dev/confirm-email', { token })
      .then((res) => {
        setStatus('success');
        setMensagem(res.data.mensagem || 'Email confirmado com sucesso!');
      })
      .catch((err) => {
        setStatus('error');
        setMensagem(err.response?.data?.detail || 'Token inválido ou expirado. Solicite um novo cadastro.');
      });
  }, [token]);

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
        maxWidth: '440px',
        background: '#fff',
        borderRadius: '16px',
        padding: '48px 40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ fontSize: '22px', color: '#1a1f3a', marginBottom: '12px' }}>Confirmando email...</h2>
            <p style={{ color: '#888', fontSize: '14px' }}>Aguarde enquanto verificamos seu token.</p>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '32px', height: '32px',
                border: '3px solid #e5e7eb',
                borderTop: '3px solid #00d4ff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontSize: '22px', color: '#1a1f3a', marginBottom: '12px' }}>Conta ativada!</h2>
            <p style={{ color: '#555', fontSize: '15px', lineHeight: '1.7', marginBottom: '28px' }}>
              {mensagem}
            </p>
            <Link
              to="/dev/login"
              style={{
                display: 'inline-block',
                padding: '14px 40px',
                background: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              Fazer login no Portal Dev
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>❌</div>
            <h2 style={{ fontSize: '22px', color: '#1a1f3a', marginBottom: '12px' }}>Falha na confirmação</h2>
            <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.7', marginBottom: '28px' }}>
              {mensagem}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link
                to="/dev/cadastro"
                style={{
                  display: 'block',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 700,
                }}
              >
                Criar nova conta
              </Link>
              <Link
                to="/dev/login"
                style={{ color: '#00d4ff', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
              >
                Já tenho conta — fazer login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DevConfirmarEmail;
