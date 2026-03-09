import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { devAuthApi, devApiKeysApi, devUsageApi, devWebhookApi, assinaturaApi, devNumerosApi } from '../services/devApi';

const META_APP_ID = '1456160206025148';
const META_CONFIG_ID = '26272726135679222';

interface ApiKey {
  id: number;
  key_prefix: string;
  nome: string | null;
  ativa: boolean;
  ultima_utilizacao: string | null;
  criada_em: string;
}

interface DevNumero {
  id: number;
  phone_number_id: string;
  waba_id: string;
  display_phone_number?: string;
  verified_name?: string;
  status: string;
  mp_subscription_status?: string;
  mp_init_point?: string;
  primeiro_uso_em?: string;
  ativo: boolean;
  criado_em: string;
}

interface DevProfile {
  id: number;
  nome: string;
  email: string;
  status: string;
  trial_inicio: string | null;
  trial_fim: string | null;
  whatsapp_conectado: boolean;
  phone_number_id: string | null;
  webhook_url: string | null;
  criado_em: string;
  phone_quality_rating: string | null;
  phone_account_mode: string | null;
  phone_display_number: string | null;
  phone_verified_name: string | null;
  phone_verified: boolean | null;
}

const DevDashboard: React.FC = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'numeros' | 'webhook' | 'docs'>('overview');
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [assinatura, setAssinatura] = useState<any>(null);
  const [connectingWA, setConnectingWA] = useState<'idle'|'loading'|'connecting'|'error'>('idle');
  const [connectError, setConnectError] = useState('');
  const signupDataRef = useRef<{ phone_number_id: string; waba_id: string } | null>(null);
  const [numeros, setNumeros] = useState<DevNumero[]>([]);
  const [cancelingNumero, setCancelingNumero] = useState<number | null>(null);
  const [cartaoStatus, setCartaoStatus] = useState<any>(null);
  const [showCartaoForm, setShowCartaoForm] = useState(false);
  const [cartaoSalvando, setCartaoSalvando] = useState(false);
  const [cartaoErro, setCartaoErro] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardDoc, setCardDoc] = useState('');
  const mpRef = useRef<any>(null);
  const [signupLink, setSignupLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [linkRedirectUrl, setLinkRedirectUrl] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [profileRes, keysRes, usageRes, numerosRes, cartaoRes] = await Promise.all([
        devAuthApi.getPerfil(),
        devApiKeysApi.listar(),
        devUsageApi.getUsage(),
        devNumerosApi.listar().catch(() => ({ numeros: [] })),
        devNumerosApi.statusCartao().catch(() => null),
      ]);
      setProfile(profileRes);
      setApiKeys(keysRes);
      setUsage(usageRes);
      setNumeros(numerosRes.numeros || []);
      setCartaoStatus(cartaoRes);

      if (profileRes.webhook_url) setWebhookUrl(profileRes.webhook_url);

      try {
        const ass = await assinaturaApi.getMinha();
        setAssinatura(ass);
      } catch { /* sem assinatura */ }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Embedded Signup Meta ──
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const ok = ['FINISH','FINISH_ONLY_WABA','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'];
          if (ok.includes(data.event) && data.data?.phone_number_id && data.data?.waba_id) {
            signupDataRef.current = { phone_number_id: data.data.phone_number_id, waba_id: data.data.waba_id };
          } else if (data.event === 'CANCEL') {
            setConnectingWA('idle');
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectWhatsApp = () => {
    setConnectError('');
    setConnectingWA('loading');
    signupDataRef.current = null;

    const initAndLogin = () => {
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: 'v25.0' });
      setConnectingWA('connecting');
      window.FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            const code = response.authResponse.code;
            let attempts = 0;
            const interval = setInterval(async () => {
              attempts++;
              const cur = signupDataRef.current;
              if (cur) {
                clearInterval(interval);
                try {
                  await devNumerosApi.conectar({ code, phone_number_id: cur.phone_number_id, waba_id: cur.waba_id });
                  await loadData();
                  setConnectingWA('idle');
                } catch (err: any) {
                  setConnectingWA('error');
                  setConnectError(err.response?.data?.detail || 'Erro ao conectar WhatsApp.');
                }
              } else if (attempts > 30) {
                clearInterval(interval);
                setConnectingWA('error');
                setConnectError('Timeout: dados do WhatsApp não recebidos. Tente novamente.');
              }
            }, 500);
          } else {
            setConnectingWA('idle');
          }
        },
        {
          config_id: META_CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: { version: 'v3', setup: {} },
        }
      );
    };

    if (window.FB) {
      initAndLogin();
    } else {
      window.fbAsyncInit = initAndLogin;
      if (!document.getElementById('facebook-jssdk')) {
        const s = document.createElement('script');
        s.id = 'facebook-jssdk';
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true; s.defer = true;
        document.body.appendChild(s);
      }
    }
  };

  const handleGerarLink = async () => {
    setGeneratingLink(true);
    setSignupLink(null);
    setCopiedLink(false);
    try {
      const res = await devNumerosApi.gerarSignupLink(linkRedirectUrl || undefined);
      setSignupLink(res.signup_url);
    } catch {
      alert('Erro ao gerar link. Tente novamente.');
    }
    setGeneratingLink(false);
  };

  const handleCopiarLink = () => {
    if (!signupLink) return;
    navigator.clipboard.writeText(signupLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCancelarNumero = async (id: number) => {
    if (!window.confirm('Cancelar este número? Ele ficará inativo.')) return;
    setCancelingNumero(id);
    try {
      await devNumerosApi.cancelar(id);
      await loadData();
    } catch { alert('Erro ao cancelar número'); }
    setCancelingNumero(null);
  };

  const initMpSdk = () => {
    const publicKey = process.env.REACT_APP_MP_PUBLIC_KEY || '';
    if (!publicKey || mpRef.current) return;
    if (window.MercadoPago) {
      mpRef.current = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
    } else {
      window.fbAsyncInit = () => {}; // no-op, we need MP not FB here
      if (!document.getElementById('mp-sdk')) {
        const s = document.createElement('script');
        s.id = 'mp-sdk';
        s.src = 'https://sdk.mercadopago.com/js/v2';
        s.async = true;
        s.onload = () => {
          const pk = process.env.REACT_APP_MP_PUBLIC_KEY || '';
          if (pk && window.MercadoPago) {
            mpRef.current = new window.MercadoPago(pk, { locale: 'pt-BR' });
          }
        };
        document.body.appendChild(s);
      }
    }
  };

  const handleSalvarCartao = async () => {
    if (!mpRef.current) { setCartaoErro('SDK do MercadoPago não carregou. Recarregue a página.'); return; }
    setCartaoSalvando(true);
    setCartaoErro('');
    try {
      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ''),
        cardholderName: cardHolder,
        cardExpirationMonth: cardExpMonth,
        cardExpirationYear: cardExpYear,
        securityCode: cardCvv,
        identificationType: 'CPF',
        identificationNumber: cardDoc.replace(/[^\d]/g, ''),
      });
      if (!tokenResult?.id) { setCartaoErro('Erro ao tokenizar cartão. Verifique os dados.'); return; }

      // Descobrir bandeira (primeiros 4 digitos)
      const bin = cardNumber.replace(/\s/g, '').substring(0, 6);
      let paymentMethodId = 'visa';
      try {
        const methods = await mpRef.current.getInstallments({ amount: '1', bin });
        paymentMethodId = methods?.[0]?.payment_method_id || 'visa';
      } catch { /* fallback */ }

      await devNumerosApi.salvarCartao({
        card_token: tokenResult.id,
        payment_method_id: paymentMethodId,
        last4: cardNumber.replace(/\s/g, '').slice(-4),
      });
      await loadData();
      setShowCartaoForm(false);
      setCardNumber(''); setCardHolder(''); setCardExpMonth(''); setCardExpYear(''); setCardCvv(''); setCardDoc('');
    } catch (err: any) {
      setCartaoErro(err.response?.data?.detail || err.message || 'Erro ao salvar cartão');
    } finally {
      setCartaoSalvando(false);
    }
  };

  const handleCreateKey = async () => {
    try {
      const result = await devApiKeysApi.criar(newKeyName || undefined);
      setCreatedKey(result.key);
      setNewKeyName('');
      const keys = await devApiKeysApi.listar();
      setApiKeys(keys);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao criar API key');
    }
  };

  const handleRevokeKey = async (id: number) => {
    if (!window.confirm('Revogar esta API key? Esta acao nao pode ser desfeita.')) return;
    try {
      await devApiKeysApi.revogar(id);
      setApiKeys(prev => prev.filter(k => k.id !== id));
    } catch { alert('Erro ao revogar key'); }
  };

  const handleSaveWebhook = async () => {
    try {
      const result = await devWebhookApi.setConfig(webhookUrl);
      setWebhookSecret(result.webhook_secret);
      alert('Webhook configurado!');
    } catch { alert('Erro ao salvar webhook'); }
  };

  const handleTestWebhook = async () => {
    try {
      const result = await devWebhookApi.test();
      alert(result.message);
    } catch { alert('Erro ao testar webhook'); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0e27' }}>
        <p style={{ color: '#fff' }}>Carregando...</p>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '12px', padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '16px',
  };

  const statusColor = {
    trial: '#f59e0b',
    active: '#22c55e',
    overdue: '#f97316',
    blocked: '#ef4444',
  }[profile?.status || 'trial'];

  const trialDaysLeft = profile?.trial_fim
    ? Math.max(0, Math.ceil((new Date(profile.trial_fim).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
        padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px', color: '#00d4ff' }}>{'</>'}</span>
          <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>Dev Portal</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#b8c1ec', fontSize: '14px' }}>{profile?.email}</span>
          <span style={{
            background: statusColor, color: '#fff', padding: '4px 12px',
            borderRadius: '12px', fontSize: '12px', fontWeight: 700,
          }}>
            {profile?.status?.toUpperCase()}
          </span>
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid #555', color: '#b8c1ec',
            padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
          }}>
            Sair
          </button>
        </div>
      </header>

      {/* Trial Banner */}
      {profile?.status === 'trial' && (
        <div style={{
          background: 'linear-gradient(90deg, #f59e0b, #f97316)',
          color: '#fff', padding: '10px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 600,
        }}>
          Trial gratuito: {trialDaysLeft} dias restantes.
          <a href="/planos" style={{ color: '#fff', marginLeft: '12px', textDecoration: 'underline' }}>
            Assinar agora
          </a>
        </div>
      )}

      {/* Blocked Banner */}
      {profile?.status === 'blocked' && (
        <div style={{
          background: '#ef4444', color: '#fff', padding: '10px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 600,
        }}>
          Sua conta esta bloqueada.
          <a href="/planos" style={{ color: '#fff', marginLeft: '12px', textDecoration: 'underline' }}>
            Renovar assinatura
          </a>
        </div>
      )}

      {/* Nav Tabs */}
      <nav style={{
        display: 'flex', gap: '0', background: '#fff', borderBottom: '1px solid #eee',
        padding: '0 24px',
      }}>
        {([
          { id: 'overview', label: 'Visao Geral' },
          { id: 'numeros', label: `Numeros${numeros.length > 0 ? ` (${numeros.length})` : ''}` },
          { id: 'keys', label: 'API Keys' },
          { id: 'webhook', label: 'Webhook' },
          { id: 'docs', label: 'Docs' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '14px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '14px', fontWeight: 600,
              color: activeTab === tab.id ? '#00d4ff' : '#888',
              borderBottom: activeTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* Usage Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Mensagens este mes</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {usage?.messages_this_month || 0}
                  <span style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}> / {usage?.limits?.mensagens_mes || 1000}</span>
                </p>
                <div style={{ marginTop: '8px', background: '#eee', borderRadius: '4px', height: '6px' }}>
                  <div style={{
                    width: `${Math.min(usage?.percentage?.messages || 0, 100)}%`,
                    background: (usage?.percentage?.messages || 0) > 80 ? '#ef4444' : '#00d4ff',
                    height: '100%', borderRadius: '4px',
                  }} />
                </div>
              </div>

              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Requests hoje</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {usage?.requests_today || 0}
                </p>
              </div>

              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>API Keys ativas</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  {apiKeys.length}
                </p>
              </div>
            </div>

            {/* WhatsApp Status */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>WhatsApp Business</h3>
              {profile?.whatsapp_conectado ? (
                <div>
                  {/* Linha principal: conectado */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', flexShrink: 0,
                    }}>✓</div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#166534', fontSize: '14px' }}>Conectado</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {profile.phone_display_number || profile.phone_number_id}
                        {profile.phone_verified_name && ` · ${profile.phone_verified_name}`}
                      </div>
                    </div>
                    {/* Badge modo: LIVE ou SANDBOX */}
                    {profile.phone_account_mode && (
                      <span style={{
                        marginLeft: 'auto',
                        padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                        background: profile.phone_account_mode === 'LIVE' ? '#dcfce7' : '#fef9c3',
                        color: profile.phone_account_mode === 'LIVE' ? '#166534' : '#854d0e',
                      }}>
                        {profile.phone_account_mode}
                      </span>
                    )}
                  </div>

                  {/* Grid de detalhes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Qualidade */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Qualidade do Número
                      </div>
                      {profile.phone_quality_rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: profile.phone_quality_rating === 'GREEN' ? '#22c55e'
                              : profile.phone_quality_rating === 'YELLOW' ? '#f59e0b'
                              : profile.phone_quality_rating === 'RED' ? '#ef4444' : '#94a3b8',
                          }} />
                          <span style={{
                            fontSize: '13px', fontWeight: 700,
                            color: profile.phone_quality_rating === 'GREEN' ? '#166534'
                              : profile.phone_quality_rating === 'YELLOW' ? '#854d0e'
                              : profile.phone_quality_rating === 'RED' ? '#991b1b' : '#64748b',
                          }}>
                            {profile.phone_quality_rating === 'GREEN' ? 'Alta' :
                             profile.phone_quality_rating === 'YELLOW' ? 'Média' :
                             profile.phone_quality_rating === 'RED' ? 'Baixa' : 'Desconhecida'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>—</span>
                      )}
                    </div>

                    {/* Verificação */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Verificação
                      </div>
                      {profile.phone_verified !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px' }}>{profile.phone_verified ? '✅' : '⏳'}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: profile.phone_verified ? '#166534' : '#92400e' }}>
                            {profile.phone_verified ? 'Verificado' : 'Pendente'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>—</span>
                      )}
                    </div>

                    {/* Phone Number ID */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                        Phone Number ID
                      </div>
                      <code style={{ fontSize: '12px', color: '#334155', wordBreak: 'break-all' }}>
                        {profile.phone_number_id}
                      </code>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#888', marginBottom: '12px' }}>WhatsApp não conectado. Configure via Embedded Signup da Meta.</p>
                  {connectError && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '10px' }}>{connectError}</p>}
                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={connectingWA === 'connecting' || connectingWA === 'loading'}
                    style={{
                      padding: '10px 24px', background: '#25D366', color: '#fff',
                      border: 'none', borderRadius: '8px', fontWeight: 600,
                      cursor: connectingWA !== 'idle' && connectingWA !== 'error' ? 'wait' : 'pointer',
                      opacity: connectingWA === 'connecting' || connectingWA === 'loading' ? 0.7 : 1,
                    }}
                  >
                    {connectingWA === 'loading' ? 'Carregando SDK…' : connectingWA === 'connecting' ? 'Conectando…' : '🔗 Conectar WhatsApp'}
                  </button>
                </div>
              )}
            </div>

            {/* Assinatura */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '12px' }}>Assinatura</h3>
              {assinatura ? (
                <div>
                  <p style={{ color: '#333' }}>Plano: <strong>{assinatura.plano_nome}</strong></p>
                  <p style={{ color: '#888', fontSize: '14px' }}>
                    Proximo vencimento: {new Date(assinatura.data_proximo_vencimento).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#888', marginBottom: '12px' }}>
                    {profile?.status === 'trial' ? `Trial gratuito: ${trialDaysLeft} dias restantes` : 'Sem assinatura ativa'}
                  </p>
                  <a href="/planos" style={{
                    display: 'inline-block', padding: '10px 24px',
                    background: 'linear-gradient(135deg, #00d4ff, #7b2cbf)', color: '#fff',
                    textDecoration: 'none', borderRadius: '8px', fontWeight: 600,
                  }}>
                    Ver Planos
                  </a>
                </div>
              )}
            </div>
          </>
        )}

        {/* NUMEROS TAB */}
        {activeTab === 'numeros' && (
          <>
            {/* Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Numeros ativos</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>{numeros.length}</p>
              </div>
              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Cobrança mensal</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: '#1a1f3a', margin: 0 }}>
                  R$ {(numeros.length * 35).toFixed(2).replace('.', ',')}
                </p>
                <p style={{ fontSize: '11px', color: '#aaa', margin: '4px 0 0' }}>R$ 35,00 / numero / mes</p>
              </div>
              <div style={cardStyle}>
                <p style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>Cartao</p>
                {cartaoStatus?.cartao_configurado ? (
                  <div>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: '#166534', margin: 0 }}>
                      ···· {cartaoStatus.last4}
                    </p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: '4px 0 0', textTransform: 'uppercase' }}>
                      {cartaoStatus.payment_method} · Ativo
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#ef4444', margin: 0, fontWeight: 600 }}>Nao configurado</p>
                )}
              </div>
            </div>

            {/* Cartao para cobrança automatica */}
            {!cartaoStatus?.cartao_configurado && numeros.length > 0 && (
              <div style={{ ...cardStyle, border: '1px solid #fbbf24', background: '#fffbeb', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>Configure seu cartao de credito</p>
                    <p style={{ color: '#a16207', fontSize: '13px', margin: 0 }}>
                      Necessario para cobrança automatica de R$ {(numeros.length * 35).toFixed(2)} / mes. Seu cartao nao sera cobrado agora.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowCartaoForm(true); initMpSdk(); }}
                    style={{ padding: '10px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Configurar cartao
                  </button>
                </div>
              </div>
            )}

            {cartaoStatus?.cartao_configurado && (
              <div style={{ ...cardStyle, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 700, color: '#166534', margin: '0 0 2px' }}>Cartao configurado ···· {cartaoStatus.last4}</p>
                  <p style={{ color: '#15803d', fontSize: '13px', margin: 0 }}>
                    Cobrança automatica de R$ {cartaoStatus.valor_proximo_cobr?.toFixed(2)} no dia {cartaoStatus.proximo_cobr_em ? new Date(cartaoStatus.proximo_cobr_em).toLocaleDateString('pt-BR') : 'proximo ciclo'}
                  </p>
                </div>
                <button
                  onClick={() => { setShowCartaoForm(true); initMpSdk(); }}
                  style={{ padding: '8px 16px', background: 'transparent', color: '#15803d', border: '1px solid #86efac', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Trocar cartao
                </button>
              </div>
            )}

            {/* Modal formulario cartao */}
            {showCartaoForm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#1a1f3a' }}>Cartao de cobrança</h3>
                    <button onClick={() => setShowCartaoForm(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>&times;</button>
                  </div>
                  <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                    Seu cartao sera salvo de forma segura via MercadoPago (PCI-compliant).
                    Nao sera cobrado agora — a cobrança ocorre automaticamente no proximo ciclo mensal.
                  </p>
                  {[
                    { label: 'Numero do cartao', value: cardNumber, onChange: (v: string) => setCardNumber(v.replace(/\D/g,'').substring(0,16).replace(/(\d{4})(?=\d)/g,'$1 ')), placeholder: '0000 0000 0000 0000', maxLen: 19 },
                    { label: 'Nome no cartao', value: cardHolder, onChange: (v: string) => setCardHolder(v.toUpperCase()), placeholder: 'COMO ESTA NO CARTAO', maxLen: 50 },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#555', fontWeight: 600, marginBottom: '4px' }}>{f.label}</label>
                      <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} maxLength={f.maxLen}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#555', fontWeight: 600, marginBottom: '4px' }}>Mes</label>
                      <input value={cardExpMonth} onChange={e => setCardExpMonth(e.target.value.replace(/\D/g,'').substring(0,2))} placeholder="MM" maxLength={2}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#555', fontWeight: 600, marginBottom: '4px' }}>Ano</label>
                      <input value={cardExpYear} onChange={e => setCardExpYear(e.target.value.replace(/\D/g,'').substring(0,4))} placeholder="AAAA" maxLength={4}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#555', fontWeight: 600, marginBottom: '4px' }}>CVV</label>
                      <input value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,'').substring(0,4))} placeholder="123" maxLength={4}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', fontWeight: 600, marginBottom: '4px' }}>CPF do titular</label>
                    <input value={cardDoc} onChange={e => setCardDoc(e.target.value)} placeholder="000.000.000-00"
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  {cartaoErro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{cartaoErro}</div>}
                  <button
                    onClick={handleSalvarCartao}
                    disabled={cartaoSalvando || !cardNumber || !cardHolder || !cardExpMonth || !cardExpYear || !cardCvv || !cardDoc}
                    style={{ width: '100%', padding: '14px', background: cartaoSalvando ? '#ccc' : 'linear-gradient(135deg,#00d4ff,#7b2cbf)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '15px', cursor: cartaoSalvando ? 'not-allowed' : 'pointer' }}
                  >
                    {cartaoSalvando ? 'Salvando...' : 'Salvar cartao'}
                  </button>
                  <p style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', marginTop: '10px' }}>Dados tokenizados pelo MercadoPago. Nunca passam pelo nosso servidor.</p>
                </div>
              </div>
            )}

            {/* Botao adicionar */}
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 700, color: '#1a1f3a', margin: '0 0 4px' }}>Adicionar novo numero</p>
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
                  Conecte um numero WhatsApp Business via Facebook Login (Embedded Signup).
                </p>
              </div>
              <div>
                {connectError && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '6px' }}>{connectError}</p>}
                <button
                  onClick={handleConnectWhatsApp}
                  disabled={connectingWA === 'connecting' || connectingWA === 'loading'}
                  style={{
                    padding: '10px 24px', background: '#25D366', color: '#fff',
                    border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: connectingWA !== 'idle' && connectingWA !== 'error' ? 0.7 : 1,
                  }}
                >
                  {connectingWA === 'loading' ? 'Carregando…' : connectingWA === 'connecting' ? 'Conectando…' : '+ Adicionar Numero'}
                </button>
              </div>
            </div>

            {/* Gerar link para cliente */}
            <div style={{ ...cardStyle, marginTop: '12px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <p style={{ fontWeight: 700, color: '#0c4a6e', margin: '0 0 4px' }}>
                    Gerar link para cliente (recomendado)
                  </p>
                  <p style={{ color: '#0369a1', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Gere um link que seu cliente clica no sistema dele. Sem redirecioná-lo para cá.
                    O número é salvo automaticamente depois que ele autoriza.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      value={linkRedirectUrl}
                      onChange={e => setLinkRedirectUrl(e.target.value)}
                      placeholder="URL de retorno do seu sistema (opcional)"
                      style={{ flex: 1, minWidth: '220px', padding: '8px 12px', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}
                    />
                    <button
                      onClick={handleGerarLink}
                      disabled={generatingLink}
                      style={{ padding: '8px 18px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: generatingLink ? 'not-allowed' : 'pointer', opacity: generatingLink ? 0.7 : 1, whiteSpace: 'nowrap' }}
                    >
                      {generatingLink ? 'Gerando…' : 'Gerar link'}
                    </button>
                  </div>
                </div>
              </div>

              {signupLink && (
                <div style={{ marginTop: '14px', background: '#fff', borderRadius: '8px', border: '1px solid #bae6fd', padding: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#0369a1', fontWeight: 600, margin: '0 0 6px' }}>
                    Link gerado (válido por 1 hora):
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <code style={{ flex: 1, fontSize: '11px', color: '#334155', wordBreak: 'break-all', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', display: 'block' }}>
                      {signupLink}
                    </code>
                    <button
                      onClick={handleCopiarLink}
                      style={{ padding: '8px 14px', background: copiedLink ? '#22c55e' : '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .2s' }}
                    >
                      {copiedLink ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
                    Cole este link em um botão no seu sistema. Quando o cliente clicar, autorizará e voltará para {linkRedirectUrl || 'a página de resultado padrão'}.
                  </p>
                </div>
              )}
            </div>

            {/* Lista de numeros */}
            {numeros.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', color: '#888', padding: '40px' }}>
                Nenhum numero registrado ainda. Adicione o primeiro acima.
              </div>
            ) : (
              numeros.map(numero => {
                const statusColors: Record<string, { bg: string; text: string }> = {
                  active:    { bg: '#dcfce7', text: '#166534' },
                  pending:   { bg: '#fef9c3', text: '#854d0e' },
                  suspended: { bg: '#fee2e2', text: '#991b1b' },
                  cancelled: { bg: '#f1f5f9', text: '#64748b' },
                };
                const mpColors: Record<string, { bg: string; text: string }> = {
                  authorized: { bg: '#dcfce7', text: '#166534' },
                  pending:    { bg: '#fef9c3', text: '#854d0e' },
                  cancelled:  { bg: '#fee2e2', text: '#991b1b' },
                };
                const sc = statusColors[numero.status] || { bg: '#f1f5f9', text: '#64748b' };
                const mpc = mpColors[numero.mp_subscription_status || ''] || { bg: '#f1f5f9', text: '#64748b' };

                return (
                  <div key={numero.id} style={{ ...cardStyle, marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      {/* Info principal */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '20px' }}>📱</span>
                          <div>
                            <div style={{ fontWeight: 700, color: '#1a1f3a', fontSize: '15px' }}>
                              {numero.display_phone_number || numero.phone_number_id}
                            </div>
                            {numero.verified_name && (
                              <div style={{ fontSize: '12px', color: '#555' }}>{numero.verified_name}</div>
                            )}
                          </div>
                          <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.text }}>
                            {numero.status.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
                          <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px' }}>
                            <div style={{ color: '#888', fontWeight: 600, marginBottom: '2px' }}>PHONE NUMBER ID</div>
                            <code style={{ color: '#334155', wordBreak: 'break-all' }}>{numero.phone_number_id}</code>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px' }}>
                            <div style={{ color: '#888', fontWeight: 600, marginBottom: '2px' }}>ASSINATURA MP</div>
                            <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: mpc.bg, color: mpc.text }}>
                              {numero.mp_subscription_status?.toUpperCase() || 'N/A'}
                            </span>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px' }}>
                            <div style={{ color: '#888', fontWeight: 600, marginBottom: '2px' }}>PRIMEIRO USO</div>
                            <span style={{ color: '#334155' }}>
                              {numero.primeiro_uso_em ? new Date(numero.primeiro_uso_em).toLocaleDateString('pt-BR') : 'Aguardando'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Acoes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '140px' }}>
                        {numero.mp_init_point && numero.mp_subscription_status !== 'authorized' && (
                          <a
                            href={numero.mp_init_point}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block', padding: '8px 14px', background: '#009ee3', color: '#fff',
                              textDecoration: 'none', borderRadius: '8px', fontSize: '12px',
                              fontWeight: 600, textAlign: 'center',
                            }}
                          >
                            Autorizar cobranca
                          </a>
                        )}
                        <button
                          onClick={() => handleSyncMp(numero.id)}
                          style={{
                            padding: '8px 14px', background: '#f0f9ff', color: '#0369a1',
                            border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Sincronizar
                        </button>
                        <button
                          onClick={() => handleCancelarNumero(numero.id)}
                          disabled={cancelingNumero === numero.id}
                          style={{
                            padding: '8px 14px', background: '#fee2e2', color: '#dc2626',
                            border: 'none', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 600, cursor: 'pointer',
                            opacity: cancelingNumero === numero.id ? 0.6 : 1,
                          }}
                        >
                          {cancelingNumero === numero.id ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* API KEYS TAB */}
        {activeTab === 'keys' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Criar Nova API Key</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Nome (opcional, ex: Producao)"
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '8px',
                    border: '1px solid #ddd', fontSize: '14px', outline: 'none',
                  }}
                />
                <button onClick={handleCreateKey} style={{
                  padding: '10px 24px', background: '#00d4ff', color: '#fff',
                  border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                }}>
                  Gerar Key
                </button>
              </div>

              {createdKey && (
                <div style={{
                  marginTop: '16px', background: '#f0fdf4', border: '1px solid #22c55e',
                  borderRadius: '8px', padding: '16px',
                }}>
                  <p style={{ color: '#166534', fontWeight: 600, marginBottom: '8px' }}>
                    API Key criada! Copie agora - ela nao sera exibida novamente.
                  </p>
                  <code style={{
                    display: 'block', background: '#fff', padding: '12px',
                    borderRadius: '6px', fontSize: '13px', wordBreak: 'break-all',
                    border: '1px solid #ddd',
                  }}>
                    {createdKey}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(createdKey); alert('Copiado!'); }}
                    style={{
                      marginTop: '8px', padding: '6px 16px', background: '#22c55e', color: '#fff',
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                    }}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Suas API Keys</h3>
              {apiKeys.length === 0 ? (
                <p style={{ color: '#888' }}>Nenhuma API key criada ainda.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Prefixo</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Nome</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Ultimo Uso</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#888', fontSize: '13px' }}>Criada</th>
                      <th style={{ textAlign: 'right', padding: '8px', color: '#888', fontSize: '13px' }}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(key => (
                      <tr key={key.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <code style={{ background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>
                            {key.key_prefix}...
                          </code>
                        </td>
                        <td style={{ padding: '10px 8px', color: '#333' }}>{key.nome || '-'}</td>
                        <td style={{ padding: '10px 8px', color: '#888', fontSize: '13px' }}>
                          {key.ultima_utilizacao ? new Date(key.ultima_utilizacao).toLocaleString('pt-BR') : 'Nunca'}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#888', fontSize: '13px' }}>
                          {new Date(key.criada_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            style={{
                              padding: '4px 12px', background: '#fee2e2', color: '#dc2626',
                              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                            }}
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* WEBHOOK TAB */}
        {activeTab === 'webhook' && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '16px' }}>Configuracao de Webhook</h3>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
              Configure a URL para onde enviaremos as mensagens recebidas no seu numero WhatsApp.
              Cada request inclui um header X-Webhook-Signature com HMAC-SHA256 para verificacao.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                Webhook URL
              </label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-servidor.com/webhook"
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: '8px',
                  border: '1px solid #ddd', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {webhookSecret && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                  Webhook Secret (para verificar assinaturas)
                </label>
                <code style={{
                  display: 'block', background: '#f5f5f5', padding: '10px 16px',
                  borderRadius: '8px', fontSize: '13px', wordBreak: 'break-all',
                }}>
                  {webhookSecret}
                </code>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleSaveWebhook} style={{
                padding: '10px 24px', background: '#00d4ff', color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
              }}>
                Salvar
              </button>
              <button onClick={handleTestWebhook} style={{
                padding: '10px 24px', background: '#f5f5f5', color: '#333',
                border: '1px solid #ddd', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
              }}>
                Enviar Teste
              </button>
            </div>
          </div>
        )}

        {/* DOCS TAB */}
        {activeTab === 'docs' && (
          <div>
            {/* ── Visao geral ── */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', color: '#1a1f3a', marginBottom: '8px' }}>Documentacao da API</h3>
              <p style={{ color: '#888', fontSize: '14px' }}>
                Gateway que autentica sua API key, valida o numero e repassa a requisicao direto para a API da Meta.
                Voce usa a mesma estrutura da Meta API oficialmente documentada.
              </p>
            </div>

            {/* ── Fluxo recomendado: server-side via link ── */}
            <div style={{ ...cardStyle, border: '2px solid #00d4ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '15px', color: '#1a1f3a', margin: 0 }}>Fluxo Recomendado: Link Server-side</h4>
                <span style={{ padding: '2px 10px', background: '#00d4ff', color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>NOVO</span>
              </div>
              <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.7, marginBottom: '12px' }}>
                Seu cliente nunca vê nosso sistema. Você gera um link, ele clica no seu sistema, autoriza, e o número aparece automaticamente na sua conta.
                Sem precisar coletar <code>code</code>, <code>waba_id</code> ou <code>phone_number_id</code> — tudo resolvido server-side.
              </p>

              <div style={{ borderLeft: '3px solid #00d4ff', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { n: 1, title: 'Gerar link (seu servidor)', desc: 'Seu backend chama POST /dev/numeros/signup-link com seu JWT. Recebe um link do Facebook com state único (válido 1h). Pode passar redirect_back_url para redirecionar o cliente de volta após autorizar.' },
                  { n: 2, title: 'Embutir link no seu sistema', desc: 'Coloque o signup_url em um botão ou link no seu CRM. O cliente clica e cai direto no Facebook — sem passar pelo nosso domínio.' },
                  { n: 3, title: 'Cliente autoriza no Facebook', desc: 'O cliente faz login no Facebook, concede permissão ao WhatsApp Business e confirma. Processo 100% guiado pelo Meta.' },
                  { n: 4, title: 'Número salvo automaticamente', desc: 'Nosso servidor recebe o callback da Meta, troca o code por token, descobre o phone_number_id e waba_id via API da Meta, e registra o DevNumero linkado à sua conta.' },
                  { n: 5, title: 'Detectar novo número', desc: 'Opção A: seu webhook configurado recebe evento number_connected com phone_number_id. Opção B: faça polling em GET /dev/numeros ou GET /dev/numeros/{id}/status.' },
                ].map(step => (
                  <div key={step.n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#00d4ff', color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step.n}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1a1f3a', fontSize: '13px' }}>{step.title}</div>
                      <div style={{ color: '#555', fontSize: '13px', lineHeight: 1.5 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Gerar Link (código) ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '8px' }}>1. Gerar link de cadastro (seu backend)</h4>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto' }}>{`POST https://api.yoursystem.dev.br/api/v1/dev/numeros/signup-link
Authorization: Bearer SEU_JWT_DE_DEV
Content-Type: application/json

{
  "redirect_back_url": "https://seucrm.com/whatsapp/sucesso"  // opcional
}

// Resposta:
{
  "signup_url": "https://www.facebook.com/dialog/oauth?...&state=abc123...",
  "expires_in": 3600,
  "session_id": "abc123..."
}

// Coloque signup_url em um <a href> ou button.onclick = () => window.open(url)`}</pre>
            </div>

            {/* ── Verificar status via webhook ou polling ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '8px' }}>2. Detectar número conectado</h4>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '8px' }}>
                Opção A — seu webhook recebe automaticamente:
              </p>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', marginBottom: '12px' }}>{`// POST para seu webhook_url configurado:
{
  "event": "number_connected",
  "phone_number_id": "123456789012345",
  "display_phone_number": "+55 11 99999-9999",
  "status": "active"
}`}</pre>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '8px' }}>
                Opção B — polling:
              </p>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto' }}>{`// Listar todos os números da conta:
GET /api/v1/dev/numeros
Authorization: Bearer SEU_JWT_DE_DEV

// Status de um número específico (rate-limit: 1 req/10s):
GET /api/v1/dev/numeros/{numero_id}/status
Authorization: Bearer SEU_JWT_DE_DEV

// Resposta:
{
  "id": 42,
  "phone_number_id": "123456789012345",
  "display_phone_number": "+55 11 99999-9999",
  "verified_name": "Nome do Negócio",
  "status": "active",   // active | pending | suspended | cancelled
  "ativo": true
}`}</pre>
            </div>

            {/* ── Enviar mensagem pelo gateway ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '8px' }}>3. Enviar mensagem (gateway)</h4>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '8px' }}>
                Use a API key no header X-Api-Key. O gateway identifica o numero pelo <strong>phone_number_id</strong> na URL
                (retornado quando o número foi registrado) e injeta o token Meta correto automaticamente.
              </p>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto' }}>{`POST https://api.yoursystem.dev.br/gateway/v20.0/{PHONE_NUMBER_ID}/messages
X-Api-Key: SUA_API_KEY
Content-Type: application/json

{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "text",
  "text": { "body": "Ola! Mensagem via API Gateway." }
}

// O gateway autentica, valida o numero e repassa para:
// POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`}</pre>
              <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
                Funciona para qualquer endpoint da Meta API: <code>/messages</code>, <code>/media</code>, etc.
                Voce pode usar vários phone_number_ids com a mesma API key.
              </p>
            </div>

            {/* ── Multiplos numeros ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '8px' }}>4. Multiplos numeros com uma API key</h4>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto' }}>{`# Numero do cliente A
POST /gateway/v20.0/111111111111111/messages
X-Api-Key: SUA_API_KEY  <-- mesma key

# Numero do cliente B (mesmo token, numero diferente)
POST /gateway/v20.0/222222222222222/messages
X-Api-Key: SUA_API_KEY  <-- mesma key

# O gateway valida que ambos os phone_number_ids
# pertencem a sua conta e usa o token correto de cada um.`}</pre>
            </div>

            {/* ── Webhook de mensagens recebidas ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '8px' }}>5. Receber mensagens (webhook)</h4>
              <p style={{ color: '#555', fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}>
                Configure sua URL na aba Webhook. Quando alguem responde ao seu numero,
                encaminhamos o payload da Meta para voce com assinatura HMAC-SHA256.
                O campo <code>phone_number_id</code> no payload identifica qual numero recebeu a mensagem.
              </p>
              <pre style={{ background: '#1a1f3a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto' }}>{`// Header da requisicao para sua URL:
X-Webhook-Signature: sha256=<hmac_do_body>

// Body (formato padrao Meta):
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "value": {
        "metadata": { "phone_number_id": "123456789012345" },
        "messages": [{ "from": "5511999999999", "type": "text", ... }]
      }
    }]
  }]
}

// Verificar assinatura (Node.js):
const sig = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody).digest('hex');
if (sig !== req.headers['x-webhook-signature'].replace('sha256=','')) {
  return res.status(403).send('Unauthorized');
}`}</pre>
            </div>

            {/* ── IDs: numero_id vs phone_number_id ── */}
            <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <h4 style={{ fontSize: '14px', color: '#92400e', marginBottom: '8px' }}>Entendendo os IDs</h4>
              <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 8px' }}><strong>numero_id</strong> (ex: 42) — ID interno da plataforma. Use para gerenciar o número: verificar status, cancelar, etc.</p>
                <p style={{ margin: '0 0 8px' }}><strong>phone_number_id</strong> (ex: 123456789012345) — ID da Meta. Use na URL do gateway para enviar mensagens: <code>/gateway/v20.0/{'{phone_number_id}'}/messages</code></p>
                <p style={{ margin: 0 }}>O <code>phone_number_id</code> é retornado em <code>GET /dev/numeros</code> e no evento <code>number_connected</code> do webhook.</p>
              </div>
            </div>

            {/* ── Limites e codigos ── */}
            <div style={cardStyle}>
              <h4 style={{ fontSize: '14px', color: '#1a1f3a', marginBottom: '12px' }}>Limites e codigos de resposta</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '6px', color: '#888' }}>Limite</th>
                    <th style={{ textAlign: 'left', padding: '6px', color: '#888' }}>Valor</th>
                  </tr></thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px', color: '#555' }}>Rate limit</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{usage?.limits?.requests_min || 60} req/min</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px', color: '#555' }}>Mensagens/mes</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{usage?.limits?.mensagens_mes || 1000}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px', color: '#555' }}>Custo por numero</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>R$ 35,00/mes</td>
                    </tr>
                  </tbody>
                </table>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '6px', color: '#888' }}>HTTP</th>
                    <th style={{ textAlign: 'left', padding: '6px', color: '#888' }}>Significado</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['200', 'Sucesso'],
                      ['401', 'API key invalida'],
                      ['403', 'Conta bloqueada / numero nao registrado'],
                      ['429', 'Rate limit (veja Retry-After)'],
                    ].map(([code, msg]) => (
                      <tr key={code} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px' }}><code>{code}</code></td>
                        <td style={{ padding: '6px', color: '#555' }}>{msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevDashboard;
