import React, { useState } from 'react';
import api from '../../services/api';
import './ModalCadastroAtendente.css';

interface ModalCadastroAtendenteProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SenhaGerada {
  email: string;
  senha: string;
  atendente_id: number;
}

export const ModalCadastroAtendente: React.FC<ModalCadastroAtendenteProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [senhaGerada, setSenhaGerada] = useState<SenhaGerada | null>(null);

  const formatarCPF = (valor: string) => {
    return valor
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorFormatado = formatarCPF(e.target.value);
    setCpf(valorFormatado);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      const response = await api.post('/auth/empresa/criar-atendente', {
        nome_exibicao: nome,
        email,
        cpf: cpf.replace(/\D/g, ''),
        data_nascimento: dataNascimento || null,
      });

      // Senha temporária gerada (primeiras 4 letras + 2026)
      const senhaTemp = nome.slice(0, 4).toLowerCase() + '2026';

      setSenhaGerada({
        email,
        senha: senhaTemp,
        atendente_id: response.data.id,
      });

      // Limpar formulário
      setNome('');
      setEmail('');
      setCpf('');
      setDataNascimento('');
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao cadastrar atendente');
    } finally {
      setLoading(false);
    }
  };

  const handleFecharSucesso = () => {
    setSenhaGerada(null);
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {senhaGerada ? (
          // Tela de sucesso com credenciais
          <div className="modal-sucesso">
            <div className="sucesso-icon">✅</div>
            <h2>Atendente Cadastrado!</h2>
            <p className="sucesso-mensagem">
              As credenciais abaixo foram geradas. Copie e envie para o atendente.
            </p>

            <div className="credenciais-box">
              <div className="credencial-item">
                <label>Email de Login:</label>
                <div className="credencial-valor">
                  {senhaGerada.email}
                  <button
                    className="btn-copiar"
                    onClick={() => navigator.clipboard.writeText(senhaGerada.email)}
                  >
                    📋
                  </button>
                </div>
              </div>

              <div className="credencial-item">
                <label>Senha Temporária:</label>
                <div className="credencial-valor">
                  {senhaGerada.senha}
                  <button
                    className="btn-copiar"
                    onClick={() => navigator.clipboard.writeText(senhaGerada.senha)}
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>

            <div className="aviso-importante">
              <strong>⚠️ Importante:</strong> O atendente deverá trocar a senha no primeiro
              acesso.
            </div>

            <button className="btn-fechar-sucesso" onClick={handleFecharSucesso}>
              Entendido
            </button>
          </div>
        ) : (
          // Formulário de cadastro
          <>
            <div className="modal-header">
              <h2>Novo Atendente</h2>
              <button className="btn-close" onClick={onClose}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="nome">Nome Completo *</label>
                <input
                  type="text"
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@empresa.com"
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="cpf">CPF</label>
                  <input
                    type="text"
                    id="cpf"
                    value={cpf}
                    onChange={handleCPFChange}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="data-nascimento">Data de Nascimento</label>
                  <input
                    type="date"
                    id="data-nascimento"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="info-senha">
                <strong>ℹ️ Senha Automática:</strong> Será gerada automaticamente (primeiras 4
                letras do nome + "2026")
              </div>

              {erro && <div className="error-message">{erro}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-cancelar" onClick={onClose} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn-cadastrar" disabled={loading}>
                  {loading ? 'Cadastrando...' : 'Cadastrar Atendente'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
