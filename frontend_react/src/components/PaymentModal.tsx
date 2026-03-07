import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pagamentosPlataformaApi } from '../services/devApi';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assinaturaId: number;
  valor: number;
  planoNome: string;
  email: string;
  mpPublicKey?: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen, onClose, assinaturaId, valor, planoNome, email, mpPublicKey,
}) => {
  const [tab, setTab] = useState<'pix' | 'cartao'>('pix');
  const [pixData, setPixData] = useState<any>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixStatus, setPixStatus] = useState<string>('');
  const pollingRef = useRef<any>(null);

  // Card state
  const [cardLoading, setCardLoading] = useState(false);
  const [cardStatus, setCardStatus] = useState<string>('');
  const [cardError, setCardError] = useState<string>('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardDocType, setCardDocType] = useState('CPF');
  const [cardDocNumber, setCardDocNumber] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [parcelasOptions, setParcelasOptions] = useState<any[]>([]);
  const mpRef = useRef<any>(null);

  const publicKey = mpPublicKey || process.env.REACT_APP_MP_PUBLIC_KEY || '';

  // Inicializar MercadoPago SDK
  useEffect(() => {
    if (isOpen && publicKey && window.MercadoPago && !mpRef.current) {
      try {
        mpRef.current = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      } catch (e) {
        console.error('Erro ao inicializar MercadoPago SDK:', e);
      }
    }
  }, [isOpen, publicKey]);

  // Buscar parcelas quando digitar os 6 primeiros digitos
  const fetchInstallments = useCallback(async (bin: string) => {
    if (!mpRef.current || bin.length < 6) return;
    try {
      const result = await mpRef.current.getInstallments({
        amount: String(valor),
        bin: bin.substring(0, 6),
      });
      if (result && result[0]?.payer_costs) {
        setParcelasOptions(result[0].payer_costs);
      }
    } catch (e) {
      console.error('Erro ao buscar parcelas:', e);
    }
  }, [valor]);

  useEffect(() => {
    const cleanNum = cardNumber.replace(/\s/g, '');
    if (cleanNum.length >= 6) {
      fetchInstallments(cleanNum);
    }
  }, [cardNumber, fetchInstallments]);

  // Gerar PIX
  const handleGerarPix = async () => {
    setPixLoading(true);
    try {
      const result = await pagamentosPlataformaApi.gerarPix(assinaturaId, email);
      setPixData(result);
      setPixStatus('pending');

      pollingRef.current = setInterval(async () => {
        try {
          const status = await pagamentosPlataformaApi.verificarStatus(result.payment_id);
          if (status.status === 'approved') {
            setPixStatus('approved');
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } catch { /* continue polling */ }
      }, 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao gerar PIX');
    } finally {
      setPixLoading(false);
    }
  };

  // Pagar com cartao
  const handlePagarCartao = async () => {
    if (!mpRef.current) {
      setCardError('SDK do MercadoPago nao carregou. Recarregue a pagina.');
      return;
    }

    setCardLoading(true);
    setCardError('');

    try {
      const cleanNum = cardNumber.replace(/\s/g, '');

      // Criar token do cartao via MercadoPago.js (PCI-compliant)
      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: cleanNum,
        cardholderName: cardHolder,
        cardExpirationMonth: cardExpMonth,
        cardExpirationYear: cardExpYear,
        securityCode: cardCvv,
        identificationType: cardDocType,
        identificationNumber: cardDocNumber.replace(/[^\d]/g, ''),
      });

      if (!tokenResult?.id) {
        setCardError('Erro ao tokenizar cartao. Verifique os dados.');
        setCardLoading(false);
        return;
      }

      // Enviar token para backend
      const result = await pagamentosPlataformaApi.pagarCartao({
        assinatura_id: assinaturaId,
        token_cartao: tokenResult.id,
        email,
        parcelas,
      });

      if (result.status === 'approved') {
        setCardStatus('approved');
      } else if (result.status === 'in_process') {
        setCardStatus('in_process');
      } else {
        setCardError(
          result.status_detail === 'cc_rejected_other_reason'
            ? 'Cartao recusado. Tente outro cartao ou entre em contato com o banco.'
            : `Pagamento ${result.status}: ${result.status_detail || 'Tente novamente.'}`
        );
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Erro ao processar pagamento';
      setCardError(detail);
    } finally {
      setCardLoading(false);
    }
  };

  // Formatar numero do cartao (4 em 4)
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').substring(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', color: '#555',
    marginBottom: '4px', fontWeight: 500,
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px',
        maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px', borderBottom: '1px solid #eee',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#1a1f3a' }}>Pagamento</h2>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: '14px' }}>
              {planoNome} - R$ {valor.toFixed(2)}/mes
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: '24px',
            cursor: 'pointer', color: '#888',
          }}>
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
          <button
            onClick={() => setTab('pix')}
            style={{
              flex: 1, padding: '14px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              color: tab === 'pix' ? '#00d4ff' : '#888',
              borderBottom: tab === 'pix' ? '2px solid #00d4ff' : '2px solid transparent',
            }}
          >
            PIX
          </button>
          <button
            onClick={() => setTab('cartao')}
            style={{
              flex: 1, padding: '14px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              color: tab === 'cartao' ? '#00d4ff' : '#888',
              borderBottom: tab === 'cartao' ? '2px solid #00d4ff' : '2px solid transparent',
            }}
          >
            Cartao de Credito
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {tab === 'pix' && (
            <div style={{ textAlign: 'center' }}>
              {pixStatus === 'approved' ? (
                <div>
                  <div style={{ fontSize: '60px', marginBottom: '16px' }}>&#x2713;</div>
                  <h3 style={{ color: '#22c55e', marginBottom: '8px' }}>Pagamento confirmado!</h3>
                  <p style={{ color: '#888' }}>Sua assinatura foi ativada com sucesso.</p>
                  <button onClick={() => window.location.reload()} style={{
                    marginTop: '16px', padding: '12px 32px',
                    background: '#22c55e', color: '#fff', border: 'none',
                    borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                  }}>
                    Continuar
                  </button>
                </div>
              ) : pixData ? (
                <div>
                  <p style={{ color: '#555', marginBottom: '16px' }}>
                    Escaneie o QR Code ou copie o codigo PIX:
                  </p>
                  {pixData.qr_code_base64 && (
                    <img
                      src={`data:image/png;base64,${pixData.qr_code_base64}`}
                      alt="QR Code PIX"
                      style={{ width: '240px', height: '240px', margin: '0 auto 16px' }}
                    />
                  )}
                  <div style={{
                    background: '#f5f5f5', padding: '12px', borderRadius: '8px',
                    fontSize: '12px', wordBreak: 'break-all', marginBottom: '12px',
                  }}>
                    {pixData.qr_code}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(pixData.qr_code); alert('Codigo PIX copiado!'); }}
                    style={{
                      padding: '10px 24px', background: '#00d4ff', color: '#fff',
                      border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Copiar codigo PIX
                  </button>
                  <p style={{ color: '#888', fontSize: '13px', marginTop: '16px' }}>
                    Aguardando confirmacao do pagamento...
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#555', marginBottom: '20px' }}>
                    Pague instantaneamente via PIX. O QR Code sera gerado automaticamente.
                  </p>
                  <button
                    onClick={handleGerarPix}
                    disabled={pixLoading}
                    style={{
                      padding: '14px 40px',
                      background: pixLoading ? '#ccc' : 'linear-gradient(135deg, #00d4ff, #7b2cbf)',
                      color: '#fff', border: 'none', borderRadius: '8px',
                      fontWeight: 700, fontSize: '16px', cursor: pixLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {pixLoading ? 'Gerando...' : `Gerar PIX - R$ ${valor.toFixed(2)}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'cartao' && (
            <div>
              {cardStatus === 'approved' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '60px', marginBottom: '16px' }}>&#x2713;</div>
                  <h3 style={{ color: '#22c55e', marginBottom: '8px' }}>Pagamento aprovado!</h3>
                  <p style={{ color: '#888' }}>Sua assinatura foi ativada com sucesso.</p>
                  <button onClick={() => window.location.reload()} style={{
                    marginTop: '16px', padding: '12px 32px',
                    background: '#22c55e', color: '#fff', border: 'none',
                    borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                  }}>
                    Continuar
                  </button>
                </div>
              ) : cardStatus === 'in_process' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '60px', marginBottom: '16px' }}>&#x23F3;</div>
                  <h3 style={{ color: '#f59e0b', marginBottom: '8px' }}>Pagamento em analise</h3>
                  <p style={{ color: '#888' }}>Seu pagamento esta sendo processado. Voce sera notificado quando for aprovado.</p>
                  <button onClick={onClose} style={{
                    marginTop: '16px', padding: '12px 32px',
                    background: '#f59e0b', color: '#fff', border: 'none',
                    borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                  }}>
                    Fechar
                  </button>
                </div>
              ) : !publicKey ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#f59e0b', fontSize: '14px' }}>
                    Pagamento com cartao sera habilitado em breve.
                  </p>
                </div>
              ) : (
                <div>
                  {/* Numero do cartao */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>Numero do cartao</label>
                    <input
                      type="text"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      style={inputStyle}
                    />
                  </div>

                  {/* Nome no cartao */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelStyle}>Nome no cartao</label>
                    <input
                      type="text"
                      placeholder="Como esta no cartao"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      style={inputStyle}
                    />
                  </div>

                  {/* Validade + CVV */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Mes</label>
                      <input
                        type="text"
                        placeholder="MM"
                        value={cardExpMonth}
                        onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, '').substring(0, 2))}
                        maxLength={2}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Ano</label>
                      <input
                        type="text"
                        placeholder="AAAA"
                        value={cardExpYear}
                        onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, '').substring(0, 4))}
                        maxLength={4}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>CVV</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                        maxLength={4}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Documento */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '100px' }}>
                      <label style={labelStyle}>Tipo doc.</label>
                      <select
                        value={cardDocType}
                        onChange={(e) => setCardDocType(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        <option value="CPF">CPF</option>
                        <option value="CNPJ">CNPJ</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Numero do documento</label>
                      <input
                        type="text"
                        placeholder={cardDocType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        value={cardDocNumber}
                        onChange={(e) => setCardDocNumber(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Parcelas */}
                  {parcelasOptions.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={labelStyle}>Parcelas</label>
                      <select
                        value={parcelas}
                        onChange={(e) => setParcelas(Number(e.target.value))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {parcelasOptions.map((p: any) => (
                          <option key={p.installments} value={p.installments}>
                            {p.installments}x de R$ {(p.installment_amount || 0).toFixed(2)}
                            {p.installments > 1 ? ` (total R$ ${(p.total_amount || 0).toFixed(2)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Erro */}
                  {cardError && (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                      padding: '12px', marginBottom: '14px', color: '#dc2626', fontSize: '13px',
                    }}>
                      {cardError}
                    </div>
                  )}

                  {/* Botao pagar */}
                  <button
                    onClick={handlePagarCartao}
                    disabled={cardLoading || !cardNumber || !cardHolder || !cardExpMonth || !cardExpYear || !cardCvv || !cardDocNumber}
                    style={{
                      width: '100%', padding: '14px',
                      background: cardLoading ? '#ccc' : 'linear-gradient(135deg, #00d4ff, #7b2cbf)',
                      color: '#fff', border: 'none', borderRadius: '8px',
                      fontWeight: 700, fontSize: '16px',
                      cursor: cardLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {cardLoading ? 'Processando...' : `Pagar R$ ${valor.toFixed(2)}`}
                  </button>

                  <p style={{ color: '#888', fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
                    Seus dados sao tokenizados pelo MercadoPago (PCI-compliant).
                    Nunca passam pelo nosso servidor.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
