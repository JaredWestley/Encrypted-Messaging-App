import { useEffect, useRef, useCallback, useState } from "react";

const WS_BASE_URL = "ws://localhost:8000/api";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseWebSocketOptions {
  serverId: number | null;
  token: string | null;
  onNewMessage?: (message: any) => void;
  onMessageEdited?: (messageId: number, content: string) => void;
  onMessageDeleted?: (messageId: number) => void;
  onTyping?: (userId: number, username: string) => void;
  onStopTyping?: (userId: number) => void;
  onDeliveryAck?: (messageId: number, status: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useWebSocket({
  serverId,
  token,
  onNewMessage,
  onMessageEdited,
  onMessageDeleted,
  onTyping,
  onStopTyping,
  onDeliveryAck,
  onConnectionChange,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 20;
  const intentionalCloseRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef({
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onTyping,
    onStopTyping,
    onDeliveryAck,
    onConnectionChange,
  });
  callbacksRef.current = {
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onTyping,
    onStopTyping,
    onDeliveryAck,
    onConnectionChange,
  };

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!serverId || !token) return;

    // Clean up existing connection
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;
    const ws = new WebSocket(`${WS_BASE_URL}/ws/${serverId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send auth message as first message
      ws.send(JSON.stringify({ type: "auth", token }));
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      callbacksRef.current.onConnectionChange?.(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        const callbacks = callbacksRef.current;

        switch (data.type) {
          case "new_message":
            callbacks.onNewMessage?.(data.message);
            break;
          case "message_edited":
            callbacks.onMessageEdited?.(data.message_id, data.content);
            break;
          case "message_deleted":
            callbacks.onMessageDeleted?.(data.message_id);
            break;
          case "typing":
            callbacks.onTyping?.(data.user_id, data.username);
            break;
          case "stop_typing":
            callbacks.onStopTyping?.(data.user_id);
            break;
          case "delivery_ack":
            callbacks.onDeliveryAck?.(data.message_id, data.status);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      setIsConnected(false);
      callbacksRef.current.onConnectionChange?.(false);

      // Reconnect with exponential backoff unless intentionally closed
      if (!intentionalCloseRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };
  }, [serverId, token]);

  // Connect when serverId or token changes
  useEffect(() => {
    if (serverId && token) {
      connect();
    }
    return () => {
      cleanup();
    };
  }, [serverId, token, connect, cleanup]);

  const sendTyping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }, []);

  const sendStopTyping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop_typing" }));
    }
  }, []);

  const sendAck = useCallback((messageId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ack", message_id: messageId }));
    }
  }, []);

  return {
    isConnected,
    sendTyping,
    sendStopTyping,
    sendAck,
  };
}
