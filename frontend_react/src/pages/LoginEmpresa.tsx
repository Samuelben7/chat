import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './Login.css';

export const LoginEmpresa: React.FC = () => {
  const { loginEmpresa } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      await loginEmpresa(email, senha);
    } catch (error: any) {
      setErro(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🏢 Login Empresa</h1>
          <p>Acesso para administradores</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@empresa.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="senha">Senha</label>
            <input
              type="password"
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          {erro && <div className="error-message">{erro}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-footer">
          <Link to="/atendente/login" className="link-secondary">
            Acessar como Atendente
          </Link>
        </div>

        <div className="login-credentials">
          <p><strong>Credenciais de teste:</strong></p>
          <p>Email: admin@yoursystem.com</p>
          <p>Senha: admin2026</p>
        </div>
      </div>
    </div>
  );
};
