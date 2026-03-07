import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { devAuthApi } from '../services/devApi';

const DevCadastro: React.FC = () => {
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    telefone: '',
    empresa_nome: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cadastrado, setCadastrado] = useState(false);
  const [emailCadastrado, setEmailCadastrado] = useState('');

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.senha !== form.confirmarSenha) {
      setError('Senhas nao coincidem');
      return;
    }

    if (form.senha.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await devAuthApi.register({
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        telefone: form.telefone || undefined,
        empresa_nome: form.empresa_nome || undefined,
      });

      setEmailCadastrado(form.email);
      setCadastrado(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao cadastrar');
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
        maxWidth: '480px',
        background: '#fff',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {cadastrado ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📧</div>
            <h2 style={{ fontSize: '22px', color: '#1a1f3a', marginBottom: '12px' }}>Verifique seu email!</h2>
            <p style={{ color: '#555', fontSize: '15px', lineHeight: '1.7', marginBottom: '8px' }}>
              Enviamos um link de confirmação para:
            </p>
            <p style={{ color: '#00d4ff', fontWeight: 700, fontSize: '16px', marginBottom: '20px' }}>
              {emailCadastrado}
            </p>
            <p style={{ color: '#888', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>
              Clique no link do email para ativar sua conta e acessar o Portal do Desenvolvedor.
              Verifique também a pasta de spam.
            </p>
            <Link to="/dev/login" style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '15px',
            }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>{'</>'}</div>
          <h1 style={{ fontSize: '24px', color: '#1a1f3a', margin: 0 }}>Cadastro de Desenvolvedor</h1>
          <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
            Crie sua conta e comece a usar a API em minutos
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2', color: '#dc2626', padding: '12px',
            borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              Nome completo *
            </label>
            <input type="text" value={form.nome} onChange={(e) => handleChange('nome', e.target.value)}
              required style={inputStyle} placeholder="Seu nome" />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              Email *
            </label>
            <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)}
              required style={inputStyle} placeholder="dev@example.com" />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                Senha *
              </label>
              <input type="password" value={form.senha} onChange={(e) => handleChange('senha', e.target.value)}
                required style={inputStyle} placeholder="Min. 6 caracteres" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                Confirmar *
              </label>
              <input type="password" value={form.confirmarSenha} onChange={(e) => handleChange('confirmarSenha', e.target.value)}
                required style={inputStyle} placeholder="Repita a senha" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                Telefone
              </label>
              <input type="text" value={form.telefone} onChange={(e) => handleChange('telefone', e.target.value)}
                style={inputStyle} placeholder="(11) 99999-9999" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                Empresa
              </label>
              <input type="text" value={form.empresa_nome} onChange={(e) => handleChange('empresa_nome', e.target.value)}
                style={inputStyle} placeholder="Sua empresa" />
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
            color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Cadastrando...' : 'Criar Conta'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: '#888', fontSize: '14px' }}>
            Ja tem conta?{' '}
            <Link to="/dev/login" style={{ color: '#00d4ff', textDecoration: 'none', fontWeight: 600 }}>
              Fazer login
            </Link>
          </p>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default DevCadastro;
