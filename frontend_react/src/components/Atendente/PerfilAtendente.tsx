import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Dashboard/ModalCadastroAtendente.css';
import './PerfilAtendente.css';

interface Perfil {
  id: number;
  nome_exibicao: string;
  email: string;
  cpf: string | null;
  data_nascimento: string | null;
  foto_url: string | null;
  status: string;
}

interface PerfilAtendenteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PerfilAtendente: React.FC<PerfilAtendenteProps> = ({ isOpen, onClose }) => {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [editando, setEditando] = useState(false);
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      carregarPerfil();
    }
  }, [isOpen]);

  const carregarPerfil = async () => {
    try {
      setLoading(true);
      const response = await api.get('/atendente/perfil');
      setPerfil(response.data);
      setNomeExibicao(response.data.nome_exibicao);
      setDataNascimento(response.data.data_nascimento || '');
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    try {
      setErro('');
      setLoading(true);

      await api.put('/atendente/perfil', {
        nome_exibicao: nomeExibicao,
        data_nascimento: dataNascimento || null,
      });

      await carregarPerfil();
      setEditando(false);
      alert('Perfil atualizado com sucesso!');
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelar = () => {
    if (perfil) {
      setNomeExibicao(perfil.nome_exibicao);
      setDataNascimento(perfil.data_nascimento || '');
    }
    setEditando(false);
    setErro('');
  };

  const handleUploadFoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem');
      return;
    }

    // Validar tamanho (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Imagem muito grande. Tamanho máximo: 5MB');
      return;
    }

    try {
      setUploadingFoto(true);
      setErro('');

      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/atendente/foto', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Atualizar foto no perfil
      if (perfil) {
        setPerfil({
          ...perfil,
          foto_url: response.data.foto_url,
        });
      }

      alert('Foto atualizada com sucesso!');
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao fazer upload da foto');
    } finally {
      setUploadingFoto(false);
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoverFoto = async () => {
    if (!window.confirm('Deseja remover sua foto de perfil?')) return;

    try {
      setUploadingFoto(true);
      setErro('');

      await api.delete('/atendente/foto');

      // Atualizar perfil
      if (perfil) {
        setPerfil({
          ...perfil,
          foto_url: null,
        });
      }

      alert('Foto removida com sucesso!');
    } catch (error: any) {
      setErro(error.response?.data?.detail || 'Erro ao remover foto');
    } finally {
      setUploadingFoto(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Meu Perfil</h2>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        {loading && !perfil ? (
          <div className="perfil-loading">Carregando...</div>
        ) : perfil ? (
          <div className="perfil-body">
            <div className="perfil-foto-section">
              <div className="perfil-foto">
                {perfil.foto_url ? (
                  <img src={perfil.foto_url} alt={perfil.nome_exibicao} />
                ) : (
                  <div className="foto-placeholder">
                    {perfil.nome_exibicao.substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUploadFoto}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div className="foto-buttons">
                <button
                  className="btn-upload-foto"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFoto}
                >
                  {uploadingFoto ? '⏳ Enviando...' : '📷 Upload Foto'}
                </button>
                {perfil.foto_url && (
                  <button
                    className="btn-remover-foto"
                    onClick={handleRemoverFoto}
                    disabled={uploadingFoto}
                  >
                    🗑️ Remover
                  </button>
                )}
              </div>
              <small className="foto-hint">
                JPG, PNG ou GIF • Máx 5MB
              </small>
            </div>

            <div className="perfil-form">
              <div className="form-group">
                <label>Nome de Exibição</label>
                {editando ? (
                  <input
                    type="text"
                    value={nomeExibicao}
                    onChange={(e) => setNomeExibicao(e.target.value)}
                    disabled={loading}
                  />
                ) : (
                  <div className="form-value">{perfil.nome_exibicao}</div>
                )}
              </div>

              <div className="form-group">
                <label>Email</label>
                <div className="form-value readonly">{perfil.email}</div>
                <small className="form-hint">Email não pode ser alterado</small>
              </div>

              {perfil.cpf && (
                <div className="form-group">
                  <label>CPF</label>
                  <div className="form-value readonly">{perfil.cpf}</div>
                  <small className="form-hint">CPF não pode ser alterado</small>
                </div>
              )}

              <div className="form-group">
                <label>Data de Nascimento</label>
                {editando ? (
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    disabled={loading}
                  />
                ) : (
                  <div className="form-value">
                    {perfil.data_nascimento
                      ? new Date(perfil.data_nascimento).toLocaleDateString('pt-BR')
                      : 'Não informado'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Status</label>
                <div className="form-value">
                  <span className={`status-badge status-${perfil.status}`}>
                    {perfil.status === 'online' ? '🟢 Online' : '⚫ Offline'}
                  </span>
                </div>
              </div>

              {erro && <div className="error-message">{erro}</div>}

              <div className="perfil-actions">
                {editando ? (
                  <>
                    <button
                      className="btn-cancelar"
                      onClick={handleCancelar}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn-salvar"
                      onClick={handleSalvar}
                      disabled={loading}
                    >
                      {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </>
                ) : (
                  <button className="btn-editar" onClick={() => setEditando(true)}>
                    ✏️ Editar Perfil
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
