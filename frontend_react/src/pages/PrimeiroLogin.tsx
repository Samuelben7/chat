import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export const PrimeiroLogin: React.FC = () => {
  const { trocarSenha, user } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    // Validações
    if (novaSenha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não conferem');
      return;
    }

    setLoading(true);

    try {
      await trocarSenha(novaSenha);
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
          <h1>🔑 Primeiro Acesso</h1>
          <p>Olá, {user?.email}!</p>
          <p>Por segurança, altere sua senha temporária</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="nova-senha">Nova Senha</label>
            <input
              type="password"
              id="nova-senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmar-senha">Confirmar Senha</label>
            <input
              type="password"
              id="confirmar-senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="Digite a mesma senha"
              required
              disabled={loading}
            />
          </div>

          {erro && <div className="error-message">{erro}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </form>

        <div className="login-credentials">
          <p><strong>Dica:</strong></p>
          <p>Use uma senha forte e única</p>
        </div>
      </div>
    </div>
  );
};
