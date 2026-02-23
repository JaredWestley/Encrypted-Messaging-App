import { useEffect, useRef, useCallback, useState } from "react";
import { WS_BASE_URL } from "./config";

interface DmWebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseDmWebSocketOptions {
  token: string | null;
  onDmNewMessage?: (conversationId: number, message: any) => void;
  onDmMessageEdited?: (conversationId: number, messageId: number, content: string) => void;
  onDmMessageDeleted?: (conversationId: number, messageId: number) => void;
  onDmTyping?: (conversationId: number, userId: number, username: string) => void;
  onDmStopTyping?: (conversationId: number, userId: number) => void;
  onFriendRequest?: (fromUser: any) => void;
  onFriendAccepted?: (friend: any) => void;
  onServerNotification?: (serverId: number) => void;
  onKeyRedistributionNeeded?: (serverId: number) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useDmWebSocket({
  token,
  onDmNewMessage,
  onDmMessageEdited,
  onDmMessageDeleted,
  onDmTyping,
  onDmStopTyping,
  onFriendRequest,
  onFriendAccepted,
  onServerNotification,
  onKeyRedistributionNeeded,
  onConnectionChange,
}: UseDmWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const intentionalCloseRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);

  // Store callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef({
    onDmNewMessage,
    onDmMessageEdited,
    onDmMessageDeleted,
    onDmTyping,
    onDmStopTyping,
    onFriendRequest,
    onFriendAccepted,
    onServerNotification,
    onKeyRedistributionNeeded,
    onConnectionChange,
  });
  callbacksRef.current = {
    onDmNewMessage,
    onDmMessageEdited,
    onDmMessageDeleted,
    onDmTyping,
    onDmStopTyping,
    onFriendRequest,
    onFriendAccepted,
    onServerNotification,
    onKeyRedistributionNeeded,
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
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    if (!token || isConnectingRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;
    isConnectingRef.current = true;
    setIsConnecting(true);
    const ws = new WebSocket(`${WS_BASE_URL}/api/ws/dm`);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false;
      // Send auth message as first message
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data: DmWebSocketMessage = JSON.parse(event.data);
        const callbacks = callbacksRef.current;

        // Handle auth result
        if (data.type === "auth_success") {
          reconnectAttemptsRef.current = 0;
          setIsConnected(true);
          setIsConnecting(false);
          callbacksRef.current.onConnectionChange?.(true);
          return;
        }
        
        if (data.type === "auth_error") {
          console.error("DM WebSocket auth error:", data.message);
          setIsConnecting(false);
          ws.close();
          return;
        }

        switch (data.type) {
          case "dm_new_message":
            callbacks.onDmNewMessage?.(data.conversation_id, data.message);
            break;
          case "dm_message_edited":
            callbacks.onDmMessageEdited?.(data.conversation_id, data.message_id, data.content);
            break;
          case "dm_message_deleted":
            callbacks.onDmMessageDeleted?.(data.conversation_id, data.message_id);
            break;
          case "dm_typing":
            callbacks.onDmTyping?.(data.conversation_id, data.user_id, data.username);
            break;
          case "dm_stop_typing":
            callbacks.onDmStopTyping?.(data.conversation_id, data.user_id);
            break;
          case "friend_request":
            callbacks.onFriendRequest?.(data.from_user);
            break;
          case "friend_accepted":
            callbacks.onFriendAccepted?.(data.friend);
            break;
          case "server_new_message_notification":
            callbacks.onServerNotification?.(data.server_id);
            break;
          case "key_redistribution_needed":
            callbacks.onKeyRedistributionNeeded?.(data.server_id);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      wsRef.current = null;
      const wasConnected = isConnectedRef.current;
      setIsConnected(false);
      if (wasConnected) {
        callbacksRef.current.onConnectionChange?.(false);
      }

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
      // WebSocket errors are normal during connection/disconnection
      // The onclose handler will manage reconnection
    };
  }, [token]);

  // Store isConnected in ref to avoid dependency issues
  const isConnectedRef = useRef(false);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Connect when token is available
  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      cleanup();
    };
  }, [token, connect, cleanup]);

  const sendDmTyping = useCallback((conversationId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "dm_typing", conversation_id: conversationId }));
    }
  }, []);

  const sendDmStopTyping = useCallback((conversationId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "dm_stop_typing", conversation_id: conversationId }));
    }
  }, []);

  return {
    isConnected,
    isConnecting,
    sendDmTyping,
    sendDmStopTyping,
  };
}
