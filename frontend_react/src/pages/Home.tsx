import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

export const Home: React.FC = () => {
  return (
    <div className="home-container">
      <div className="home-content">
        <div className="home-header">
          <h1>💬 WhatsApp Sistema</h1>
          <p>Gerenciamento profissional de atendimento via WhatsApp</p>
        </div>

        <div className="login-options">
          <Link to="/empresa/login" className="option-card empresa-card">
            <div className="card-icon">🏢</div>
            <h2>Empresa</h2>
            <p>Acesso para administradores e gerentes</p>
            <span className="card-arrow">→</span>
          </Link>

          <Link to="/atendente/login" className="option-card atendente-card">
            <div className="card-icon">👤</div>
            <h2>Atendente</h2>
            <p>Acesso para equipe de atendimento</p>
            <span className="card-arrow">→</span>
          </Link>
        </div>

        <div className="home-footer">
          <p>Desenvolvido com ❤️ por Your System</p>
        </div>
      </div>
    </div>
  );
};
