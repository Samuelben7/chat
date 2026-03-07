import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { embeddedSignupApi } from '../services/api';
import logo from '../assets/logo.png';
import './ConfigurarWhatsApp.css';

const META_APP_ID = '1456160206025148';
const META_CONFIG_ID = '26272726135679222';

type FlowState = 'idle' | 'loading-sdk' | 'ready' | 'connecting' | 'success' | 'error';

const ConfigurarWhatsApp: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<FlowState>('idle');
  const [error, setError] = useState('');

  // useRef garante que o setInterval sempre lê o valor mais recente
  // (evita o bug de stale closure com useState)
  const signupDataRef = useRef<{ phone_number_id: string; waba_id: string } | null>(null);

  useEffect(() => {
    setState('loading-sdk');

    // Listener para postMessage do Embedded Signup da Meta
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const successEvents = ['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'];
          if (successEvents.includes(data.event)) {
            const phoneId = data.data?.phone_number_id;
            const wabaId = data.data?.waba_id;
            if (phoneId && wabaId) {
              // Salva no ref — acessível imediatamente pelo setInterval sem stale closure
              signupDataRef.current = { phone_number_id: phoneId, waba_id: wabaId };
            }
          } else if (data.event === 'CANCEL') {
            setState('ready');
            setError('');
          }
        }
      } catch {
        // Ignorar mensagens não-JSON
      }
    };

    window.addEventListener('message', handleMessage);

    const initFB = () => {
      window.FB.init({
        appId: META_APP_ID,
        autoLogAppEvents: true,
        cookie: true,
        xfbml: true,
        version: 'v25.0',
      });
      setState('ready');
    };

    if (window.FB) {
      // SDK já carregado (ex: reload da página)
      initFB();
    } else if (!document.getElementById('facebook-jssdk')) {
      // Primeira carga: registra fbAsyncInit antes de inserir o script
      window.fbAsyncInit = initFB;
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else {
      // Script inserido mas FB ainda não inicializou — aguardar fbAsyncInit
      window.fbAsyncInit = initFB;
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleConnect = () => {
    if (state !== 'ready') return;

    setState('connecting');
    setError('');
    // Limpa dados anteriores ao iniciar novo fluxo
    signupDataRef.current = null;

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          const code = response.authResponse.code;

          // Aguarda o postMessage com phone_number_id + waba_id
          // O ref sempre tem o valor mais recente (sem stale closure)
          let attempts = 0;
          const interval = setInterval(async () => {
            attempts++;
            const currentData = signupDataRef.current; // Sempre lê o valor atual

            if (currentData) {
              clearInterval(interval);
              try {
                await embeddedSignupApi.connectWhatsApp({
                  code,
                  phone_number_id: currentData.phone_number_id,
                  waba_id: currentData.waba_id,
                });
                setState('success');
                setTimeout(() => navigate('/empresa/dashboard'), 2000);
              } catch (err: any) {
                setState('error');
                setError(err.response?.data?.detail || 'Erro ao conectar WhatsApp.');
              }
            } else if (attempts > 30) {
              // 15 segundos sem receber os dados
              clearInterval(interval);
              setState('error');
              setError('Timeout: dados do WhatsApp não recebidos. Tente novamente.');
            }
          }, 500);
        } else {
          // Usuário fechou o popup sem completar
          setState('ready');
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          version: 'v3',
          setup: {
            business: { id: null, name: null, email: null, phone: { code: null, number: null }, website: null, address: { streetAddress1: null, streetAddress2: null, city: null, state: null, zipPostal: null, country: null }, timezone: null },
            phone: { displayName: null, category: null, description: null },
            preVerifiedPhone: { ids: null },
            solutionID: null,
            whatsAppBusinessAccount: { ids: null },
          },
        },
      }
    );
  };

  return (
    <div className="cw-container">
      {/* Background orbs */}
      <div className="cw-orb cw-orb-1" />
      <div className="cw-orb cw-orb-2" />

      <div className="cw-card">
        {/* Logo */}
        <div className="cw-logo">
          <img src={logo} alt="YourSystem" />
        </div>

        <h1 className="cw-title">Conectar WhatsApp Business</h1>
        <p className="cw-subtitle">
          Configure seu WhatsApp Business para começar a atender seus clientes automaticamente.
        </p>

        {state === 'loading-sdk' && (
          <div className="cw-status">
            <div className="cw-spinner" />
            <p>Carregando...</p>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div className="cw-features">
              <div className="cw-feature-item">
                <span className="cw-feature-icon">1</span>
                <span>Clique em "Conectar WhatsApp"</span>
              </div>
              <div className="cw-feature-item">
                <span className="cw-feature-icon">2</span>
                <span>Complete o fluxo da Meta (crie ou selecione sua conta)</span>
              </div>
              <div className="cw-feature-item">
                <span className="cw-feature-icon">3</span>
                <span>Pronto! Seu WhatsApp estará conectado automaticamente</span>
              </div>
            </div>

            <button className="cw-btn-primary" onClick={handleConnect}>
              Conectar WhatsApp
            </button>
          </>
        )}

        {state === 'connecting' && (
          <div className="cw-status">
            <div className="cw-spinner" />
            <p>Conectando seu WhatsApp...</p>
            <p className="cw-status-sub">Complete o fluxo na janela da Meta</p>
          </div>
        )}

        {state === 'success' && (
          <div className="cw-status">
            <div className="cw-success-icon">&#10003;</div>
            <h2>WhatsApp Conectado!</h2>
            <p>Redirecionando para o dashboard...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="cw-status">
            <div className="cw-error-icon">!</div>
            <p className="cw-error-text">{error}</p>
            <button
              className="cw-btn-primary"
              onClick={() => {
                setState('ready');
                setError('');
              }}
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {(state === 'ready' || state === 'error') && (
          <button
            className="cw-btn-skip"
            onClick={() => navigate('/empresa/dashboard')}
          >
            Pular por agora
          </button>
        )}

        <p className="cw-footer-text">
          Logado como <strong>{user?.email}</strong>
        </p>
      </div>
    </div>
  );
};

export default ConfigurarWhatsApp;
