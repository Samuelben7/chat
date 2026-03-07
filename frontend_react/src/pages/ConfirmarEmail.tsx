import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo.jpg';
import './ConfirmarEmail.css';

const API_URL = process.env.REACT_APP_API_URL;

const ConfirmarEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Token de confirmação não encontrado.');
      return;
    }

    confirmarEmail(token);
  }, [searchParams]);

  const confirmarEmail = async (token: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/empresa/confirm-email`, {
        token,
      });

      setStatus('success');
      setMessage(response.data.mensagem || 'Email confirmado com sucesso!');
      setEmpresaNome(response.data.empresa_nome || '');

      // Redireciona para login com next=configurar-whatsapp após 3 segundos
      setTimeout(() => {
        navigate('/login?next=configurar-whatsapp');
      }, 3000);
    } catch (err: any) {
      setStatus('error');
      if (err.response?.data?.detail) {
        setMessage(err.response.data.detail);
      } else {
        setMessage('Erro ao confirmar email. Tente novamente ou entre em contato.');
      }
    }
  };

  return (
    <div className="confirmar-email-container">
      <div className="confirmar-email-card">
        <div className="logo-container">
          <img src={logo} alt="WhatsApp Sistema" />
        </div>

        {status === 'loading' && (
          <>
            <div className="loader-icon">
              <div className="spinner-large"></div>
            </div>
            <h1>Confirmando seu email...</h1>
            <p>Aguarde enquanto validamos seu cadastro.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="success-icon-large">✅</div>
            <h1>Email Confirmado!</h1>
            <p>{message}</p>
            {empresaNome && (
              <p className="empresa-nome">Bem-vindo, <strong>{empresaNome}</strong>!</p>
            )}
            <p className="redirect-message">
              Redirecionando para o login em 3 segundos...
            </p>
            <button
              onClick={() => navigate('/login?next=configurar-whatsapp')}
              className="btn-primary"
            >
              Ir para Login Agora
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon-large">❌</div>
            <h1>Erro na Confirmação</h1>
            <p className="error-text">{message}</p>
            <div className="error-actions">
              <button
                onClick={() => navigate('/cadastro')}
                className="btn-secondary"
              >
                Fazer Novo Cadastro
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-primary"
              >
                Ir para Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ConfirmarEmail;
