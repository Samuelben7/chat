import React from 'react';
import './ListaAniversarios.css';

interface Aniversariante {
  id: number;
  nome: string;
  tipo: 'cliente' | 'atendente';
  data_nascimento: string;
  dia_mes: number;
  whatsapp?: string;
}

interface ListaAniversariosProps {
  aniversariantes: Aniversariante[];
}

export const ListaAniversarios: React.FC<ListaAniversariosProps> = ({ aniversariantes }) => {
  const formatarData = (dataStr: string) => {
    const data = new Date(dataStr);
    return `${data.getDate().toString().padStart(2, '0')}/${(data.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  };

  const getIconeTipo = (tipo: string) => {
    return tipo === 'atendente' ? '👤' : '👥';
  };

  const getTipoTexto = (tipo: string) => {
    return tipo === 'atendente' ? 'Atendente' : 'Cliente';
  };

  if (aniversariantes.length === 0) {
    return (
      <div className="aniversarios-container">
        <h3 className="aniversarios-title">🎂 Aniversários do Mês</h3>
        <div className="aniversarios-empty">
          <p>Nenhum aniversariante este mês</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aniversarios-container">
      <h3 className="aniversarios-title">🎂 Aniversários do Mês</h3>
      <div className="aniversarios-lista">
        {aniversariantes.map((aniversariante) => (
          <div key={`${aniversariante.tipo}-${aniversariante.id}`} className="aniversariante-card">
            <div className="aniversariante-data">
              <span className="data-dia">{aniversariante.dia_mes}</span>
              <span className="data-mes">
                {new Date(aniversariante.data_nascimento).toLocaleDateString('pt-BR', {
                  month: 'short',
                })}
              </span>
            </div>

            <div className="aniversariante-info">
              <div className="aniversariante-nome">{aniversariante.nome}</div>
              <div className="aniversariante-tipo">
                <span className="tipo-icon">{getIconeTipo(aniversariante.tipo)}</span>
                <span className="tipo-texto">{getTipoTexto(aniversariante.tipo)}</span>
              </div>
            </div>

            {aniversariante.whatsapp && (
              <a
                href={`https://wa.me/${aniversariante.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
                title="Enviar mensagem"
              >
                💬
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
