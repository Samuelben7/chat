import React from 'react';
import './TypingIndicator.css';

interface TypingIndicatorProps {
  nome?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ nome }) => {
  return (
    <div className="typing-indicator-wrapper">
      <div className="typing-content">
        <span className="typing-text">
          {nome ? `${nome} está digitando` : 'Digitando'}
        </span>
        <div className="typing-dots">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>
    </div>
  );
};
