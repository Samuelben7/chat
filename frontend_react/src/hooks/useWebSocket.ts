import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  event: string;
  data: any;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export const useWebSocket = (token: string | null, options: UseWebSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Deduplicação de mensagens client-side (protege contra duplicatas)
  const seenMessageIdsRef = useRef<Set<string | number>>(new Set());

  // Store callbacks in refs to avoid recreating connect function
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const {
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options;

  const connect = useCallback(() => {
    if (!token) {
      console.log('⚠️ WebSocket: Token não fornecido');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Usar variável de ambiente ou derivar do API_URL
      const wsUrl = process.env.REACT_APP_WS_URL
        ? `${process.env.REACT_APP_WS_URL}?token=${token}`
        : (() => {
            const apiUrl = process.env.REACT_APP_API_URL || 'https://api.yoursystem.dev.br/api/v1';
            const protocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
            const host = apiUrl.replace(/^https?:\/\//, '').replace('/api/v1', '');
            return `${protocol}//${host}/api/v1/ws?token=${token}`;
          })();

      console.log(`🔌 Conectando WebSocket...`);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ WebSocket conectado');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        callbacksRef.current.onConnect?.();

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'ping' }));
          }
        }, 30000);

        ws.addEventListener('close', () => clearInterval(heartbeat));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          // Deduplicação local (apenas para eventos de nova_mensagem)
          if (message.event === 'nova_mensagem') {
            const msgId = message.data?.mensagem?.id;

            if (msgId && seenMessageIdsRef.current.has(msgId)) {
              console.log('⚠️ Mensagem duplicada (ignorada):', msgId);
              return; // Skip mensagem duplicada
            }

            if (msgId) {
              seenMessageIdsRef.current.add(msgId);

              // Limitar Set a 1000 mensagens (evita memory leak)
              if (seenMessageIdsRef.current.size > 1000) {
                const firstId = seenMessageIdsRef.current.values().next().value;
                seenMessageIdsRef.current.delete(firstId);
              }
            }
          }

          setLastMessage(message);
          callbacksRef.current.onMessage?.(message);
        } catch (error) {
          console.error('Erro ao parsear mensagem WS:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
        callbacksRef.current.onError?.(error);
      };

      ws.onclose = (event) => {
        console.log(`WebSocket desconectado (código: ${event.code})`);
        setIsConnected(false);
        wsRef.current = null;
        callbacksRef.current.onDisconnect?.();

        if (autoReconnect && event.code !== 1000) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(reconnectInterval * reconnectAttemptsRef.current, 30000);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
    }
  }, [token, autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((event: string, data: any = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  useEffect(() => {
    if (token) connect();
    return () => disconnect();
  }, [token, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
  };
};
