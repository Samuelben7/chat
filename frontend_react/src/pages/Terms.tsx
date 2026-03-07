import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaFileContract } from 'react-icons/fa';
import './StaticPages.css';

const Terms: React.FC = () => {
  return (
    <div className="static-page">
      <div className="container">
        <Link to="/" className="back-link">
          <FaArrowLeft /> Voltar ao Inicio
        </Link>

        <div className="page-header">
          <FaFileContract style={{ fontSize: '4rem', color: '#00d4ff', marginBottom: '20px' }} />
          <h1>Termos de Uso</h1>
        </div>

        <div className="page-content">
          <p>
            Ao utilizar os servicos do <strong>YourSystem Automacoes e Sistemas</strong>, voce concorda com os termos abaixo.
          </p>

          <h2>Servicos</h2>
          <p>
            Oferecemos desenvolvimento de sistemas, automacoes, bots de atendimento e suporte tecnico especializado para diversos segmentos empresariais.
          </p>

          <h2>Uso Adequado</h2>
          <p>
            O usuario compromete-se a utilizar os servicos conforme a legislacao brasileira vigente e as politicas da Meta (WhatsApp).
          </p>

          <h2>Suspensao</h2>
          <p>
            O descumprimento dos termos de uso pode resultar na suspensao imediata do servico, sem aviso previo.
          </p>

          <h2>Contato</h2>
          <p>
            Para duvidas sobre os termos de uso, entre em contato:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:contato@yoursystem.dev.br">contato@yoursystem.dev.br</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Terms;
