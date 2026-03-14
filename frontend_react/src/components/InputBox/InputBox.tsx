import React, { useState, useRef, useEffect } from 'react';
import { BsSend, BsEmojiSmile, BsPaperclip, BsMic, BsStopFill, BsX } from 'react-icons/bs';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from '../../contexts/ThemeContext';

interface InputBoxProps {
  onEnviar: (mensagem: string) => void;
  onTyping?: () => void;
  onAttachment?: (file: File) => void;
  enviando?: boolean;
  disabled?: boolean;
  conversaSelecionada?: string | null;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

const InputBox: React.FC<InputBoxProps> = ({ onEnviar, onTyping, onAttachment, enviando, disabled, conversaSelecionada, inputRef }) => {
  const [mensagem, setMensagem] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef || internalRef;
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, colors } = useTheme();

  // ── Texto ────────────────────────────────────────────────
  const enviarMensagem = () => {
    if (mensagem.trim() && !enviando && !disabled) {
      const conteudo = mensagem.trim();
      setMensagem('');
      onEnviar(conteudo);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMensagem(e.target.value);
    if (onTyping && e.target.value.length > 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTyping();
      typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 3000);
    }
  };

  // ── Emoji ────────────────────────────────────────────────
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = mensagem.substring(0, start) + emojiData.emoji + mensagem.substring(end);
      setMensagem(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emojiData.emoji.length;
        textarea.focus();
      }, 0);
    }
  };

  // ── Arquivo ──────────────────────────────────────────────
  const handleAttachmentClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      e.target.value = '';
    }
  };

  const cancelPendingFile = () => setPendingFile(null);

  const enviarArquivo = () => {
    if (pendingFile && !enviando) {
      onAttachment?.(pendingFile);
      setPendingFile(null);
    }
  };

  // ── Áudio ────────────────────────────────────────────────
  const formatRecordingTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const baseMime = mimeType.split(';')[0];
        const ext = baseMime.includes('ogg') ? 'ogg' : baseMime.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: baseMime });
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: baseMime });
        onAttachment?.(file);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      console.error('Permissão de microfone negada ou não disponível');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  // ── Focus helpers ────────────────────────────────────────
  useEffect(() => {
    if (!conversaSelecionada) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [conversaSelecionada]);

  const prevMensagemRef = useRef(mensagem);
  useEffect(() => {
    if (prevMensagemRef.current.length > 0 && mensagem.length === 0) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevMensagemRef.current = mensagem;
  }, [mensagem]);

  const prevEnviandoRef = useRef(enviando);
  useEffect(() => {
    if (prevEnviandoRef.current && !enviando) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevEnviandoRef.current = enviando;
  }, [enviando]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node))
        setShowEmojiPicker(false);
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const hasText = mensagem.trim().length > 0;
  const isBusy = disabled || enviando;

  // ── Render ───────────────────────────────────────────────
  return (
    <div
      className="relative border-t p-2 flex items-end space-x-1.5"
      style={{ backgroundColor: colors.inputBg, borderColor: colors.border, flexShrink: 0 }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Arquivo pendente (preview + confirmar) ── */}
      {pendingFile && !isRecording && (
        <div
          className="absolute bottom-14 left-2 right-2 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ backgroundColor: colors.messageReceived, border: `1px solid ${colors.border}` }}
        >
          <span className="text-[12px] truncate flex-1" style={{ color: colors.textPrimary }}>
            📎 {pendingFile.name}
          </span>
          <button
            onClick={enviarArquivo}
            disabled={isBusy}
            className="text-white text-[11px] font-semibold px-2.5 py-1 rounded-full disabled:opacity-50"
            style={{ background: colors.primary }}
          >
            {enviando ? '...' : 'Enviar'}
          </button>
          <button onClick={cancelPendingFile} className="hover:opacity-70" style={{ color: colors.textSecondary }}>
            <BsX size={18} />
          </button>
        </div>
      )}

      {/* ── Gravando áudio ── */}
      {isRecording && (
        <div
          className="absolute bottom-14 left-2 right-2 px-3 py-2 rounded-lg flex items-center gap-3"
          style={{ backgroundColor: colors.messageReceived, border: `1px solid ${colors.border}` }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-[13px] font-medium flex-1" style={{ color: colors.textPrimary }}>
            Gravando… {formatRecordingTime(recordingTime)}
          </span>
          <button
            onClick={cancelRecording}
            className="text-[11px] px-2.5 py-1 rounded-full"
            style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
          >
            Cancelar
          </button>
          <button
            onClick={stopRecording}
            className="text-white text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#e74c3c' }}
          >
            Parar e Enviar
          </button>
        </div>
      )}

      {/* ── Emoji Picker ── */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-16 left-2 z-50"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)', borderRadius: '8px', overflow: 'hidden' }}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={350}
            height={450}
            previewConfig={{ showPreview: false }}
            searchPlaceholder="Buscar emoji..."
            theme={theme === 'yoursystem' ? Theme.DARK : Theme.LIGHT}
          />
        </div>
      )}

      {/* Attachment button */}
      <button
        type="button"
        onClick={handleAttachmentClick}
        className="transition-colors p-2 hover:opacity-80"
        style={{ color: pendingFile ? colors.accent : colors.textSecondary }}
        disabled={isBusy || isRecording}
        tabIndex={-1}
        title="Anexar arquivo"
      >
        <BsPaperclip size={22} />
      </button>

      {/* Emoji button */}
      <button
        type="button"
        onClick={() => setShowEmojiPicker(v => !v)}
        className="transition-colors p-2 hover:opacity-80"
        style={{ color: colors.textSecondary }}
        disabled={isBusy || isRecording}
        tabIndex={-1}
        title="Emoji"
      >
        <BsEmojiSmile size={22} />
      </button>

      {/* Input */}
      <div className="flex-1">
        <textarea
          ref={textareaRef}
          value={mensagem}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Gravando áudio…' : disabled ? 'Não é possível enviar mensagens' : 'Sua mensagem...'}
          disabled={isBusy || isRecording}
          autoFocus
          rows={1}
          className="w-full px-3 py-2 rounded-[10px] focus:outline-none resize-none max-h-32 disabled:opacity-50 disabled:cursor-not-allowed text-[14px] leading-5"
          style={{
            minHeight: '40px',
            maxHeight: '120px',
            backgroundColor: colors.messageReceived,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            transition: 'border-color 0.2s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = colors.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = colors.border; }}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
          }}
        />
      </div>

      {/* Botão direito: Enviar texto / Parar gravação / Microfone */}
      {hasText ? (
        <button
          type="button"
          onClick={enviarMensagem}
          disabled={!hasText || isBusy}
          tabIndex={-1}
          className="text-white p-2.5 rounded-full transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center min-w-[40px] min-h-[40px]"
          style={{
            background: theme === 'yoursystem'
              ? 'linear-gradient(135deg, #4B7BEC 0%, #6C8EE6 100%)'
              : colors.primary,
          }}
          title="Enviar"
        >
          {enviando ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <BsSend size={18} />
          )}
        </button>
      ) : isRecording ? (
        <button
          type="button"
          onClick={stopRecording}
          tabIndex={-1}
          className="text-white p-2.5 rounded-full transition-all hover:opacity-90 flex items-center justify-center min-w-[40px] min-h-[40px]"
          style={{ background: '#e74c3c' }}
          title="Parar e enviar áudio"
        >
          <BsStopFill size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          disabled={isBusy}
          tabIndex={-1}
          className="p-2.5 rounded-full transition-all hover:opacity-80 flex items-center justify-center min-w-[40px] min-h-[40px]"
          style={{ color: colors.textSecondary }}
          title="Gravar áudio"
        >
          <BsMic size={22} />
        </button>
      )}
    </div>
  );
};

export default InputBox;
