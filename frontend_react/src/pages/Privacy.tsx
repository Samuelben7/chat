import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaShieldAlt } from 'react-icons/fa';
import './StaticPages.css';

const Privacy: React.FC = () => {
  return (
    <div className="static-page">
      <div className="container">
        <Link to="/" className="back-link">
          <FaArrowLeft /> Voltar ao Inicio
        </Link>

        <div className="page-header">
          <FaShieldAlt style={{ fontSize: '4rem', color: '#00d4ff', marginBottom: '20px' }} />
          <h1>Politica de Privacidade</h1>
        </div>

        <div className="page-content">
          <p>
            O <strong>YourSystem Automacoes e Sistemas</strong> respeita a privacidade dos seus usuarios e esta comprometido com a protecao dos dados pessoais, conforme a <strong>Lei Geral de Protecao de Dados (LGPD)</strong>.
          </p>

          <h2>Dados Coletados</h2>
          <ul>
            <li>Nome</li>
            <li>Numero de telefone</li>
            <li>Mensagens enviadas via WhatsApp</li>
          </ul>

          <h2>Finalidade</h2>
          <p>
            Os dados sao utilizados exclusivamente para atendimento, suporte, automacoes e melhoria dos servicos oferecidos.
          </p>

          <h2>Seguranca</h2>
          <p>
            Adotamos as melhores praticas de seguranca para proteger os dados contra acessos nao autorizados, incluindo criptografia de ponta a ponta.
          </p>

          <h2>Contato</h2>
          <p>
            Para duvidas ou solicitacoes relacionadas aos seus dados, entre em contato conosco:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:contato@yoursystem.dev.br">contato@yoursystem.dev.br</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
