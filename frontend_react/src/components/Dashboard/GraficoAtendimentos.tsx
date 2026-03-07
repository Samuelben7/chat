import React from 'react';
import './GraficoAtendimentos.css';

interface GraficoAtendimentosProps {
  labels: string[];
  valores: number[];
}

export const GraficoAtendimentos: React.FC<GraficoAtendimentosProps> = ({ labels, valores }) => {
  const maxValor = Math.max(...valores, 1);

  return (
    <div className="grafico-container">
      <h3 className="grafico-title">Atendimentos da Semana</h3>
      <div className="grafico-barras">
        {labels.map((label, index) => {
          const altura = (valores[index] / maxValor) * 100;
          return (
            <div key={index} className="barra-wrapper">
              <div className="barra-valor">{valores[index]}</div>
              <div className="barra-container">
                <div
                  className="barra"
                  style={{ height: `${altura}%` }}
                  title={`${label}: ${valores[index]} atendimentos`}
                />
              </div>
              <div className="barra-label">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
