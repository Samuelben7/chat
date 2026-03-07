import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Mensagem } from '../../types';
import { format } from 'date-fns';
import { BsCheck, BsCheckAll, BsPlayFill, BsPauseFill, BsFileEarmarkPdf, BsFileEarmarkText, BsDownload } from 'react-icons/bs';
import { useTheme } from '../../contexts/ThemeContext';
import { mediaApi } from '../../services/api';
import './MessageBubble.css';

const AVATAR_COLORS = ['#CE423D', '#FDE6A5', '#4AAD67', '#A7D5FE'];
const AVATAR_TEXT_COLORS: Record<string, string> = {
  '#CE423D': '#ffffff',
  '#FDE6A5': '#333333',
  '#4AAD67': '#ffffff',
  '#A7D5FE': '#333333',
};

const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface MessageBubbleProps {
  mensagem: Mensagem;
  showAvatar?: boolean;
  contactName?: string;
  onReply?: (mensagem: Mensagem) => void;
}

const AudioPlayer: React.FC<{ url: string; duration?: string }> = ({ url, duration }) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { colors } = useTheme();

  const bars = useMemo(() => Array.from({ length: 28 }, () => Math.random() * 100), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setTotalDuration(audio.duration);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-message">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={togglePlay}
        className="audio-play-btn"
        style={{ color: colors.accent }}
      >
        {playing ? <BsPauseFill size={22} /> : <BsPlayFill size={22} />}
      </button>
      <div className="audio-waveform">
        {bars.map((height, i) => (
          <div
            key={i}
            className="audio-bar"
            style={{
              height: `${Math.max(15, height)}%`,
              backgroundColor: i / bars.length * 100 <= progress
                ? colors.accent
                : colors.textSecondary,
              opacity: i / bars.length * 100 <= progress ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <span className="audio-duration" style={{ color: colors.textSecondary }}>
        {currentTime > 0 ? formatTime(currentTime) : (duration || '0:00')}
      </span>
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ mensagem, showAvatar = true, contactName, onReply }) => {
  const [hovered, setHovered] = useState(false);
  const isEnviada = mensagem.direcao === 'enviada';
  const { theme, colors } = useTheme();

  if ((!mensagem.conteudo || mensagem.conteudo.trim() === '') && !mensagem.dados_extras?.media_id) {
    return null;
  }

  const formatarHora = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return '';
    }
  };

  // Iniciais para o avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const avatarName = contactName || mensagem.whatsapp_number || '?';
  const isDark = theme === 'yoursystem';

  const renderConteudo = () => {
    const { tipo_mensagem, dados_extras } = mensagem;

    // Audio (via proxy ou URL direta legada)
    if (tipo_mensagem === 'audio') {
      const audioUrl = dados_extras?.media_id
        ? mediaApi.getProxyUrl(dados_extras.media_id)
        : dados_extras?.audio_url;
      if (audioUrl) {
        return <AudioPlayer url={audioUrl} duration={dados_extras?.duration} />;
      }
    }

    // Imagem (via proxy ou URL direta legada)
    if (tipo_mensagem === 'image') {
      const imageUrl = dados_extras?.media_id
        ? mediaApi.getProxyUrl(dados_extras.media_id)
        : dados_extras?.image_url;
      if (imageUrl) {
        return (
          <div>
            <img
              src={imageUrl}
              alt="Imagem"
              style={{
                maxWidth: '100%',
                borderRadius: '10px',
                marginBottom: mensagem.conteudo && mensagem.conteudo !== '📷 Imagem' ? '8px' : '0',
                display: 'block',
                cursor: 'pointer',
              }}
              onClick={() => window.open(imageUrl, '_blank')}
            />
            {mensagem.conteudo && mensagem.conteudo !== '📷 Imagem' && (
              <p className="message-text">{mensagem.conteudo}</p>
            )}
          </div>
        );
      }
    }

    // Documento (PDF, CSV, Word, Excel...)
    if (tipo_mensagem === 'document' && dados_extras?.media_id) {
      const docUrl = mediaApi.getProxyUrl(dados_extras.media_id);
      const filename = dados_extras.filename || mensagem.conteudo || 'Documento';
      const isPdf = (dados_extras.mime_type || '').includes('pdf');
      return (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={filename}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 4px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span style={{ fontSize: '28px', flexShrink: 0 }}>
            {isPdf ? <BsFileEarmarkPdf size={28} style={{ color: '#e74c3c' }} /> : <BsFileEarmarkText size={28} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filename.replace(/^📄\s*/, '')}
            </span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>
              {dados_extras.mime_type || 'Documento'}
            </span>
          </span>
          <BsDownload size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
        </a>
      );
    }

    // Vídeo
    if (tipo_mensagem === 'video' && dados_extras?.media_id) {
      const videoUrl = mediaApi.getProxyUrl(dados_extras.media_id);
      return (
        <div>
          <video
            controls
            style={{ maxWidth: '100%', borderRadius: '10px', display: 'block' }}
            preload="metadata"
          >
            <source src={videoUrl} type={dados_extras.mime_type || 'video/mp4'} />
          </video>
          {mensagem.conteudo && mensagem.conteudo !== '🎥 Vídeo' && (
            <p className="message-text" style={{ marginTop: '6px' }}>{mensagem.conteudo}</p>
          )}
        </div>
      );
    }

    // Botoes
    if (tipo_mensagem === 'button' && dados_extras?.buttons) {
      return (
        <div style={{ margin: '-6px -9px -8px -9px' }}>
          {dados_extras.header_image_url && (
            <div style={{
              width: '100%',
              height: 160,
              background: `url(${dados_extras.header_image_url}) center/cover no-repeat`,
              backgroundColor: '#e0e0e0',
              borderRadius: '10px 10px 0 0',
            }} />
          )}

          <div style={{ padding: '8px 12px' }}>
            {dados_extras.header && !dados_extras.header_image_url && (
              <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 4px', color: isEnviada && isDark ? '#ffffff' : undefined }}>
                {dados_extras.header}
              </p>
            )}
            <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>{mensagem.conteudo}</p>
            {dados_extras.footer && (
              <div style={{ fontSize: '11px', color: isEnviada && isDark ? 'rgba(255,255,255,0.65)' : colors.textSecondary, marginTop: '4px' }}>
                {dados_extras.footer}
              </div>
            )}
          </div>

          {dados_extras.buttons.map((btn: any, index: number) => (
            <div
              key={index}
              style={{
                borderTop: `1px solid ${isEnviada && isDark ? 'rgba(255,255,255,0.2)' : colors.border}`,
                padding: '10px 12px',
                textAlign: 'center',
                color: isEnviada && isDark ? '#ffffff' : colors.accent,
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {btn.title || btn.reply?.title || btn.text}
            </div>
          ))}
        </div>
      );
    }

    // Listas
    if (tipo_mensagem === 'list' && dados_extras?.sections) {
      return (
        <div style={{ margin: '-6px -9px -8px -9px' }}>
          <div style={{ padding: '8px 12px' }}>
            {dados_extras.header && (
              <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 4px' }}>
                {dados_extras.header}
              </p>
            )}
            <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>{mensagem.conteudo}</p>
            {dados_extras.footer && (
              <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                {dados_extras.footer}
              </div>
            )}
          </div>

          {dados_extras.sections.map((section: any, secIndex: number) => (
            <div key={secIndex}>
              {section.title && (
                <div style={{
                  borderTop: `1px solid ${colors.border}`,
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: colors.textSecondary,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.5px',
                }}>
                  {section.title}
                </div>
              )}
              {section.rows?.map((row: any, rowIndex: number) => (
                <div
                  key={rowIndex}
                  style={{
                    borderTop: `1px solid ${isEnviada && isDark ? 'rgba(255,255,255,0.2)' : colors.border}`,
                    padding: '10px 12px',
                    textAlign: 'center',
                    color: isEnviada && isDark ? '#ffffff' : colors.accent,
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {row.title}
                  {row.description && (
                    <div style={{ fontSize: '11px', color: isEnviada && isDark ? 'rgba(255,255,255,0.65)' : colors.textSecondary, fontWeight: 400, marginTop: '2px' }}>
                      {row.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Sticker (WebP estático ou animado — renderiza como imagem sem fundo de balão)
    if (tipo_mensagem === 'sticker' && dados_extras?.media_id) {
      const stickerUrl = mediaApi.getProxyUrl(dados_extras.media_id);
      return (
        <img
          src={stickerUrl}
          alt={dados_extras.animated ? 'Sticker animado' : 'Sticker'}
          style={{
            width: 120,
            height: 120,
            objectFit: 'contain',
            display: 'block',
            background: 'transparent',
          }}
        />
      );
    }

    // Sticker animado não-suportado pela API Meta (chega como unsupported)
    if (tipo_mensagem === 'sticker') {
      return <p className="message-text" style={{ fontStyle: 'italic', opacity: 0.7 }}>🏷️ Sticker animado</p>;
    }

    // Resposta de botao/lista
    if ((tipo_mensagem === 'interactive' || tipo_mensagem === 'button_reply' || tipo_mensagem === 'list_reply') && dados_extras) {
      const displayText = dados_extras.button_title || dados_extras.list_title || mensagem.conteudo;
      return <p className="message-text">{displayText}</p>;
    }

    // Texto simples
    return <p className="message-text">{mensagem.conteudo}</p>;
  };

  // Bloco de citação (reply) — mostrado quando mensagem é resposta a outra
  const renderReplyBlock = () => {
    const { dados_extras } = mensagem;
    if (!dados_extras?.reply_to_content) return null;
    const isReplySent = dados_extras.reply_to_direcao === 'enviada';
    return (
      <div style={{
        borderLeft: `3px solid ${isReplySent ? colors.primary : colors.accent}`,
        background: isEnviada ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.06)',
        borderRadius: '4px',
        padding: '4px 8px',
        marginBottom: 6,
        cursor: 'default',
        overflow: 'hidden',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: isReplySent ? colors.primary : colors.accent }}>
          {isReplySent ? 'Você' : 'Contato'}
        </p>
        <p style={{
          fontSize: 12, margin: 0, opacity: 0.75,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 240,
        }}>
          {dados_extras.reply_to_content}
        </p>
      </div>
    );
  };

  // Iniciais do usuario logado para avatar do lado direito
  const getSentInitials = () => {
    return 'EU';
  };

  return (
    <div
      className={`message-bubble ${isEnviada ? 'sent' : 'received'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onReply && mensagem.message_id && onReply(mensagem)}
    >
      {/* Avatar ao lado da mensagem recebida (esquerda) */}
      {!isEnviada && showAvatar && isDark && (
        <div
          className="message-avatar"
          style={{
            background: getAvatarColor(avatarName),
            color: AVATAR_TEXT_COLORS[getAvatarColor(avatarName)],
          }}
        >
          {getInitials(avatarName)}
        </div>
      )}

      <div className="message-content-wrapper" style={{ position: 'relative' }}>
        {/* Pontinha do balao — oculta para stickers */}
        {isDark && !isEnviada && mensagem.tipo_mensagem !== 'sticker' && (
          <div className="bubble-tail-left" style={{ borderRightColor: colors.messageReceived }} />
        )}
        {isDark && isEnviada && mensagem.tipo_mensagem !== 'sticker' && (
          <div className="bubble-tail-right" style={{ borderLeftColor: colors.messageSent }} />
        )}

        {/* Botão de reply — aparece no hover, posicionado junto ao balão */}
        {onReply && mensagem.message_id && hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onReply(mensagem); }}
            title="Responder (ou clique duplo)"
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              ...(isEnviada ? { left: -32 } : { right: -32 }),
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 14,
              color: colors.textSecondary,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              zIndex: 10,
            }}
          >
            ↩
          </button>
        )}

        <div
          className={`message-content ${isDark ? 'dark-bubble' : ''}`}
          style={mensagem.tipo_mensagem === 'sticker' ? {
            background: 'transparent',
            boxShadow: 'none',
            border: 'none',
            padding: '4px',
          } : undefined}
        >
          {renderReplyBlock()}
          {renderConteudo()}

          <div className="message-footer">
            <span className="message-time">
              {formatarHora(mensagem.timestamp)}
            </span>

            {isEnviada && (
              <span className="message-status" style={{
                marginLeft: '4px',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                {mensagem.lida ? (
                  <BsCheckAll style={{ fontSize: '16px', color: '#53bdeb', strokeWidth: '0.5' }} />
                ) : mensagem.message_id ? (
                  <BsCheckAll style={{ fontSize: '16px', color: '#667781', strokeWidth: '0.5' }} />
                ) : (
                  <BsCheck style={{ fontSize: '16px', color: '#667781', strokeWidth: '0.5' }} />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Avatar ao lado da mensagem enviada (direita) */}
      {isEnviada && showAvatar && isDark && (
        <div
          className="message-avatar message-avatar-right"
          style={{
            background: getAvatarColor(getSentInitials()),
            color: AVATAR_TEXT_COLORS[getAvatarColor(getSentInitials())],
          }}
        >
          {getSentInitials()}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
