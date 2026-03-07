import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaTrashAlt } from 'react-icons/fa';
import './StaticPages.css';

const DataDeletion: React.FC = () => {
  return (
    <div className="static-page">
      <div className="container">
        <Link to="/" className="back-link">
          <FaArrowLeft /> Voltar ao Inicio
        </Link>

        <div className="page-header">
          <FaTrashAlt style={{ fontSize: '4rem', color: '#00d4ff', marginBottom: '20px' }} />
          <h1>Exclusao de Dados</h1>
        </div>

        <div className="page-content">
          <p>
            O usuario pode solicitar a exclusao de seus dados pessoais a qualquer momento, conforme garantido pela <strong>LGPD</strong>.
          </p>

          <h2>Como Solicitar</h2>
          <p>
            Para solicitar a exclusao dos seus dados, envie um email para:
          </p>
          <p className="email-highlight">
            <a href="mailto:contato@yoursystem.dev.br">contato@yoursystem.dev.br</a>
          </p>
          <p>
            No email, informe seus dados (nome, telefone) e indique que deseja solicitar a exclusao das suas informacoes.
          </p>

          <h2>Prazo</h2>
          <p>
            Os dados serao excluidos permanentemente em ate <strong>30 dias</strong> apos a solicitacao.
          </p>

          <div className="warning-box">
            <p>
              <strong>Atencao:</strong> A exclusao dos dados e <strong>irreversivel</strong>. Apos a confirmacao, nao sera possivel recuperar as informacoes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDeletion;
