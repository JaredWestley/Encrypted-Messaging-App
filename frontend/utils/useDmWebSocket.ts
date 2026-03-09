import { useEffect, useRef, useCallback, useState } from "react";
import { WS_BASE_URL } from "./config";

interface DmWebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseDmWebSocketOptions {
  token: string | null;
  refreshAccessToken?: () => Promise<boolean>;
  onDmNewMessage?: (conversationId: number, message: any) => void;
  onDmMessageEdited?: (conversationId: number, messageId: number, content: string, isEncrypted?: boolean, nonce?: string, senderPublicKey?: string) => void;
  onDmMessageDeleted?: (conversationId: number, messageId: number) => void;
  onDmTyping?: (conversationId: number, userId: number, username: string) => void;
  onDmStopTyping?: (conversationId: number, userId: number) => void;
  onFriendRequest?: (fromUser: any) => void;
  onFriendAccepted?: (friend: any) => void;
  onServerNotification?: (serverId: number) => void;
  onKeyRedistributionNeeded?: (serverId: number) => void;
  onConnectionChange?: (connected: boolean) => void;
  // Call signaling callbacks
  onCallOffer?: (fromUserId: number, fromUsername: string, offer: string, callType: "voice" | "video", callId: string) => void;
  onCallAnswer?: (fromUserId: number, answer: string, callId: string) => void;
  onCallIceCandidate?: (fromUserId: number, candidate: any, callId: string) => void;
  onCallReject?: (fromUserId: number, callId: string) => void;
  onCallHangup?: (fromUserId: number, callId: string) => void;
  // Collaborative document callbacks
  onDocCreated?: (document: any, conversationId: number) => void;
  onDocDeleted?: (documentId: number, conversationId: number) => void;
  onDocRenamed?: (documentId: number, title: string, conversationId: number) => void;
  onDocEdit?: (documentId: number, content: string, conversationId: number, userId: number, username: string) => void;
  onWhiteboardAction?: (documentId: number, action: any, conversationId: number, userId: number, username: string) => void;
  onWhiteboardUndo?: (documentId: number, conversationId: number, userId: number, username: string) => void;
  onWhiteboardRedo?: (documentId: number, conversationId: number, userId: number, username: string) => void;
  onCursorUpdate?: (documentId: number, cursorType: string, position: any, conversationId: number, userId: number, username: string) => void;
}

export function useDmWebSocket({
  token,
  refreshAccessToken,
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
  onCallOffer,
  onCallAnswer,
  onCallIceCandidate,
  onCallReject,
  onCallHangup,
  onDocCreated,
  onDocDeleted,
  onDocRenamed,
  onDocEdit,
  onWhiteboardAction,
  onWhiteboardUndo,
  onWhiteboardRedo,
  onCursorUpdate,
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
    onCallOffer,
    onCallAnswer,
    onCallIceCandidate,
    onCallReject,
    onCallHangup,
    onDocCreated,
    onDocDeleted,
    onDocRenamed,
    onDocEdit,
    onWhiteboardAction,
    onWhiteboardUndo,
    onWhiteboardRedo,
    onCursorUpdate,
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
    onCallOffer,
    onCallAnswer,
    onCallIceCandidate,
    onCallReject,
    onCallHangup,
    onDocCreated,
    onDocDeleted,
    onDocRenamed,
    onDocEdit,
    onWhiteboardAction,
    onWhiteboardUndo,
    onWhiteboardRedo,
    onCursorUpdate,
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
          // Try refreshing the token — the hook will reconnect when token changes
          if (refreshAccessToken) {
            refreshAccessToken().catch(() => {});
          }
          return;
        }

        switch (data.type) {
          case "dm_new_message":
            callbacks.onDmNewMessage?.(data.conversation_id, data.message);
            break;
          case "dm_message_edited":
            callbacks.onDmMessageEdited?.(data.conversation_id, data.message_id, data.content, data.is_encrypted, data.nonce, data.sender_public_key);
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
          // Call signaling
          case "call_offer":
            callbacks.onCallOffer?.(data.from_user_id, data.from_username, data.offer, data.call_type, data.call_id);
            break;
          case "call_answer":
            callbacks.onCallAnswer?.(data.from_user_id, data.answer, data.call_id);
            break;
          case "call_ice_candidate":
            callbacks.onCallIceCandidate?.(data.from_user_id, data.candidate, data.call_id);
            break;
          case "call_reject":
            callbacks.onCallReject?.(data.from_user_id, data.call_id);
            break;
          case "call_hangup":
            callbacks.onCallHangup?.(data.from_user_id, data.call_id);
            break;
          // Collaborative document events
          case "doc_created":
            callbacks.onDocCreated?.(data.document, data.conversation_id);
            break;
          case "doc_deleted":
            callbacks.onDocDeleted?.(data.document_id, data.conversation_id);
            break;
          case "doc_renamed":
            callbacks.onDocRenamed?.(data.document_id, data.title, data.conversation_id);
            break;
          case "doc_edit":
            callbacks.onDocEdit?.(data.document_id, data.content, data.conversation_id, data.user_id, data.username);
            break;
          case "whiteboard_action":
            callbacks.onWhiteboardAction?.(data.document_id, data.action, data.conversation_id, data.user_id, data.username);
            break;
          case "whiteboard_undo":
            callbacks.onWhiteboardUndo?.(data.document_id, data.conversation_id, data.user_id, data.username);
            break;
          case "whiteboard_redo":
            callbacks.onWhiteboardRedo?.(data.document_id, data.conversation_id, data.user_id, data.username);
            break;
          case "cursor_update":
            callbacks.onCursorUpdate?.(data.document_id, data.cursor_type, data.position, data.conversation_id, data.user_id, data.username);
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

  // ─── Call signaling send functions ─────────────────────────────
  const sendCallOffer = useCallback((toUserId: number, offer: string, callType: "voice" | "video", callId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call_offer", to_user_id: toUserId, offer, call_type: callType, call_id: callId }));
    }
  }, []);

  const sendCallAnswer = useCallback((toUserId: number, answer: string, callId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call_answer", to_user_id: toUserId, answer, call_id: callId }));
    }
  }, []);

  const sendCallIceCandidate = useCallback((toUserId: number, candidate: any, callId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call_ice_candidate", to_user_id: toUserId, candidate, call_id: callId }));
    }
  }, []);

  const sendCallReject = useCallback((toUserId: number, callId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call_reject", to_user_id: toUserId, call_id: callId }));
    }
  }, []);

  const sendCallHangup = useCallback((toUserId: number, callId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call_hangup", to_user_id: toUserId, call_id: callId }));
    }
  }, []);

  // ─── Collaborative document send functions ─────────────────────
  const sendDocEdit = useCallback((conversationId: number, documentId: number, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "doc_edit", conversation_id: conversationId, document_id: documentId, content }));
    }
  }, []);

  const sendWhiteboardAction = useCallback((conversationId: number, documentId: number, action: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "whiteboard_action", conversation_id: conversationId, document_id: documentId, action }));
    }
  }, []);

  const sendWhiteboardUndo = useCallback((conversationId: number, documentId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "whiteboard_undo", conversation_id: conversationId, document_id: documentId }));
    }
  }, []);

  const sendWhiteboardRedo = useCallback((conversationId: number, documentId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "whiteboard_redo", conversation_id: conversationId, document_id: documentId }));
    }
  }, []);

  const sendCursorUpdate = useCallback((conversationId: number, documentId: number, cursorType: string, position: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor_update", conversation_id: conversationId, document_id: documentId, cursor_type: cursorType, position }));
    }
  }, []);

  return {
    isConnected,
    isConnecting,
    sendDmTyping,
    sendDmStopTyping,
    sendCallOffer,
    sendCallAnswer,
    sendCallIceCandidate,
    sendCallReject,
    sendCallHangup,
    sendDocEdit,
    sendWhiteboardAction,
    sendWhiteboardUndo,
    sendWhiteboardRedo,
    sendCursorUpdate,
  };
}
