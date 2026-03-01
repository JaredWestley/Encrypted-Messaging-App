import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  YStack,
  XStack,
  Text,
  Card,
  Theme,
} from "tamagui";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert as RNAlert,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Menu,
  X as CloseIcon,
} from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ServerSidebar from "./components/ServerSidebar";
import RightSidebar from "./components/RightSidebar";
import SettingsDialog from "./components/SettingsDialog";
import UserProfileDialog from "./components/UserProfileDialog";
import FriendsList from "./components/FriendsList";
import IncomingCallModal from "./components/IncomingCallModal";
import ActiveCallOverlay from "./components/ActiveCallOverlay";
import VoiceChannelPanel from "./components/VoiceChannelPanel";
import ChatHeader from "./_chat_components/ChatHeader";
import ChatInput from "./_chat_components/ChatInput";
import MessageBubble from "./_chat_components/MessageBubble";
import MessageOptionsModal from "./_chat_components/MessageOptionsModal";
import EmptyState from "./_chat_components/EmptyState";
import TypingIndicator from "./_chat_components/TypingIndicator";
import SnackbarToast from "./_chat_components/SnackbarToast";
import { isImageMimeType, formatFileSize } from "./_chat_components/AttachmentImagePreview";
import type { MessageAttachment, Message, Server, User, ImageDecryptContext } from "./_chat_components/types";
import { useWebRTC, type CallState } from "../../../utils/useWebRTC";
import { useVoiceChannel } from "../../../utils/useVoiceChannel";
import { ICE_SERVERS } from "../../../utils/webrtcConfig";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  apiRequest,
  deleteMessage,
  updateMessage,
  sendMessage,
  syncMessages,
  joinServerWithInvite,
  fetchConversations,
  fetchConversationMessages,
  sendDirectMessage,
  editDirectMessage,
  deleteDirectMessage,
  syncDirectMessages,
  fetchFriendRequests,
  fetchPendingRequests,
  uploadPublicKey,
  fetchPublicKey,
  fetchServerKey,
  fetchServerMemberPublicKeys,
  uploadServerKeys,
  fetchUserRoles,
  uploadAttachment,
  downloadAttachment,
  ConversationData,
  DirectMessageData,
  AttachmentData,
} from "../../../utils/api";
import { useAuth } from "../../../utils/AuthContext";
import { useWebSocket } from "../../../utils/useWebSocket";
import { useDmWebSocket } from "../../../utils/useDmWebSocket";
import { API_URL } from "../../../utils/config";
import {
  encryptDmMessage,
  decryptDmMessage,
  encryptServerMessage,
  decryptServerMessage,
  encryptServerKeyForMember,
  decryptServerKey,
  generateServerKey,
  encryptFileBytes,
  decryptFileBytes,
  encryptFileBytesForDm,
  decryptFileBytesFromDm,
  encodeBase64,
  decodeBase64,
} from "../../../utils/encryption";
import { getOrCreateKeyPair, getPrivateKey, getServerKey, storeServerKey, clearServerKey } from "../../../utils/keyManager";



const ChatPage: React.FC = () => {
  const router = useRouter();
  const { token, username, userId, logout, refreshAccessToken, isLoading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Responsive breakpoint
  const isDesktop = width >= 768;
  const isTablet = width >= 600 && width < 768;
  const isMobile = width < 600;

  // Server state
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [didLeaveServer, setDidLeaveServer] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    name: string;
    size: number;
    mimeType: string;
    uri: string;
  } | null>(null);

  // Ref for showSnackbar so WS callbacks can use the latest version (defined early)
  const showSnackbarRef = useRef<(msg: string) => void>(() => {});

  // Mobile sidebar states
  const [showServerSidebar, setShowServerSidebar] = useState(false);
  const [showUserSidebar, setShowUserSidebar] = useState(false);
  const [friendsListOpen, setFriendsListOpen] = useState(false);
  const [friendsRefreshTrigger, setFriendsRefreshTrigger] = useState(0);

  // WebSocket & real-time state
  const [wsConnected, setWsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const lastMessageIdRef = useRef<number | null>(null);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDisconnectedRef = useRef(false);

  // ─── DM State ──────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  // Ref to always have latest selected server/conversation in WS callbacks
  const selectedServerRef = useRef<Server | null>(null);
  selectedServerRef.current = selectedServer;
  const selectedConversationIdRef = useRef<number | null>(null);
  selectedConversationIdRef.current = selectedConversationId;
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [dmTypingUsers, setDmTypingUsers] = useState<Map<number, string>>(new Map());
  const dmTypingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const lastDmMessageIdRef = useRef<number | null>(null);
  const dmTypingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Friend request counts
  const [incomingRequestsCount, setIncomingRequestsCount] = useState(0);
  const [outgoingRequestsCount, setOutgoingRequestsCount] = useState(0);

  // Unread DM tracking - set of conversation IDs with new messages
  const [unreadConversations, setUnreadConversations] = useState<Set<number>>(new Set());
  const unreadDmCount = unreadConversations.size;

  // Unread server tracking - set of server IDs with new messages
  const [unreadServers, setUnreadServers] = useState<Set<number>>(new Set());

  // ─── Stable refs for WS callbacks (avoid stale closures) ──────
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // ─── Encryption State ──────────────────────────────────────────
  const myKeyPairRef = useRef<{ publicKey: Uint8Array; secretKey: Uint8Array } | null>(null);
  const [encryptionReady, setEncryptionReady] = useState(false);
  // Ref for sendKeyNeeded (populated after useWebSocket hook) so fetchAndCacheServerKey can use it
  const sendKeyNeededRef = useRef<(() => void) | null>(null);

  // ─── Call State ─────────────────────────────────────────────────
  const [callMinimized, setCallMinimized] = useState(false);
  // Ref for WebRTC signaling handler — set after useWebRTC hook is created
  const handleCallSignalingRef = useRef<((msg: any) => void) | null>(null);

  // ─── Permission State ──────────────────────────────────────────
  const [channelPermissionDenied, setChannelPermissionDenied] = useState(false);
  const [canSendMessages, setCanSendMessages] = useState(true);

  // Determine which mode we're in
  const isDmMode = selectedConversationId !== null && selectedServer === null;

  // Get the active conversation data
  const activeConversation = conversations.find(c => c.id === selectedConversationId);

  // Store DM partner name separately so it persists even if conversations haven't loaded yet
  const [dmPartnerNameOverride, setDmPartnerNameOverride] = useState<string | null>(null);

  const getConversationDisplayName = (convo: ConversationData): string => {
    if (convo.name) return convo.name;
    const other = convo.members.find(m => m.id !== userId);
    return other?.username || "Unknown";
  };

  // Update dmPartnerNameOverride whenever activeConversation or conversations change
  useEffect(() => {
    if (activeConversation) {
      const name = getConversationDisplayName(activeConversation);
      if (name && name !== "Unknown") {
        setDmPartnerNameOverride(name);
      }
    }
  }, [activeConversation, userId]);

  // Track the last message ID for sync
  useEffect(() => {
    if (!isDmMode && messages.length > 0) {
      lastMessageIdRef.current = Math.max(...messages.map(m => m.id));
    }
  }, [messages, isDmMode]);

  useEffect(() => {
    if (isDmMode && dmMessages.length > 0) {
      lastDmMessageIdRef.current = Math.max(...dmMessages.map(m => m.id));
    }
  }, [dmMessages, isDmMode]);

  // ─── Server WebSocket callbacks ──────────────────────────────
  const handleWsNewMessage = useCallback(async (message: any) => {
    // Guard: only add messages for the currently selected server
    const currentServer = selectedServerRef.current;
    if (!currentServer) return;
    if (message.server_id && message.server_id !== currentServer.id) return;

    let decryptedContent = message.content;
    if (message.is_encrypted && message.nonce) {
      let serverKeyBytes = await getServerKey(currentServer.id);
      // If no cached key, try fetching it now (it may have been redistributed)
      if (!serverKeyBytes && myKeyPairRef.current) {
        try {
          const serverKeyData = await fetchServerKey(tokenRef.current!, currentServer.id, logoutRef.current);
          // Use encrypted_by to get the right public key for decryption
          const encryptorId = serverKeyData.encrypted_by;
          const fallbackOwnerId = serversRef.current.find((s: any) => s.id === currentServer.id)?.owner_id;
          const keyUserId = encryptorId || fallbackOwnerId;
          if (keyUserId) {
            const encryptorKeyData = await fetchPublicKey(tokenRef.current!, keyUserId, logoutRef.current);
            if (encryptorKeyData.public_key) {
              const encryptorPubKey = decodeBase64(encryptorKeyData.public_key);
              const decryptedKey = decryptServerKey(
                serverKeyData.encrypted_key,
                serverKeyData.nonce,
                encryptorPubKey,
                myKeyPairRef.current.secretKey
              );
              if (decryptedKey) {
                await storeServerKey(currentServer.id, decryptedKey);
                serverKeyBytes = decryptedKey;
                // Key just became available — reload all messages to decrypt them
                loadMessagesRef.current?.();
              }
            }
          }
        } catch {
          // Key still not available
        }
      }
      if (serverKeyBytes) {
        const plaintext = decryptServerMessage(message.content, message.nonce, serverKeyBytes);
        decryptedContent = plaintext || "[Could not decrypt]";
      } else {
        decryptedContent = "[Encrypted]";
      }
    }
    const decryptedMsg = { ...message, content: decryptedContent };
    setMessages((prev) => {
      if (prev.some(m => m.id === decryptedMsg.id)) return prev;
      return [...prev, decryptedMsg];
    });
  }, []);

  const handleWsMessageEdited = useCallback(async (messageId: number, content: string, isEncrypted?: boolean, nonce?: string) => {
    let decryptedContent = content;
    if (isEncrypted && nonce) {
      const currentServer = selectedServerRef.current;
      if (currentServer) {
        const serverKeyBytes = await getServerKey(currentServer.id);
        if (serverKeyBytes) {
          const plaintext = decryptServerMessage(content, nonce, serverKeyBytes);
          decryptedContent = plaintext || "[Could not decrypt]";
        } else {
          decryptedContent = "[Encrypted]";
        }
      }
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: decryptedContent } : m))
    );
  }, []);

  const handleWsMessageDeleted = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const handleWsTyping = useCallback((uid: number, uname: string, serverId?: number) => {
    if (uid === userId) return;
    // Guard: only show typing for the currently selected server
    const currentServer = selectedServerRef.current;
    if (serverId && currentServer && serverId !== currentServer.id) return;
    setTypingUsers((prev) => {
      const next = new Map(prev);
      next.set(uid, uname);
      return next;
    });
    const existing = typingTimeoutsRef.current.get(uid);
    if (existing) clearTimeout(existing);
    typingTimeoutsRef.current.set(
      uid,
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(uid);
          return next;
        });
        typingTimeoutsRef.current.delete(uid);
      }, 3000)
    );
  }, [userId]);

  const handleWsStopTyping = useCallback((uid: number, serverId?: number) => {
    // Guard: only process stop_typing for the currently selected server
    const currentServer = selectedServerRef.current;
    if (serverId && currentServer && serverId !== currentServer.id) return;
    setTypingUsers((prev) => {
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
    const existing = typingTimeoutsRef.current.get(uid);
    if (existing) {
      clearTimeout(existing);
      typingTimeoutsRef.current.delete(uid);
    }
  }, []);

  // Load messages function
  const loadMessagesRef = useRef<() => Promise<void>>(async () => {});
  loadMessagesRef.current = async () => {
    if (!token || !selectedServer) return;
    try {
      // Ensure server key is fetched and cached before loading messages.
      // This is the single authoritative place for server key fetching —
      // it handles initial load, server switch, and reconnect.
      if (myKeyPairRef.current) {
        await fetchAndCacheServerKey(selectedServer.id);
      }

      const res = await fetch(
        `${API_URL}/messages?server_id=${selectedServer.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const detail = body?.detail || "";
        if (detail.includes("permission") || detail.includes("VIEW_CHANNEL")) {
          setChannelPermissionDenied(true);
          setMessages([]);
          return;
        }
      }
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      const data = await res.json();
      setChannelPermissionDenied(false);
      // Decrypt server messages using the cached key
      let serverKeyBytes = await getServerKey(selectedServer.id);
      const decryptedData = data.map((m: any) => {
        let content = m.content;
        if (m.is_encrypted && m.nonce && serverKeyBytes) {
          const plaintext = decryptServerMessage(m.content, m.nonce, serverKeyBytes);
          content = plaintext || "[Could not decrypt]";
        } else if (m.is_encrypted) {
          content = "[Encrypted]";
        }
        return { ...m, content };
      });
      setMessages(decryptedData);
    } catch {
      setError("Failed to load messages");
    }
  };

  const handleConnectionChange = useCallback(async (connected: boolean) => {
    setWsConnected(connected);
    if (connected && wasDisconnectedRef.current && selectedServer && token) {
      const lastId = lastMessageIdRef.current;
      if (lastId !== null) {
        try {
          const missed = await syncMessages(token, selectedServer.id, lastId, logout);
          if (missed.length > 0) {
            // Decrypt missed messages before adding to state
            let serverKeyBytes = await getServerKey(selectedServer.id);
            if (!serverKeyBytes) {
              await fetchAndCacheServerKey(selectedServer.id);
              serverKeyBytes = await getServerKey(selectedServer.id);
            }
            const decryptedMissed = missed.map((m: any) => {
              let content = m.content;
              if (m.is_encrypted && m.nonce && serverKeyBytes) {
                const plaintext = decryptServerMessage(m.content, m.nonce, serverKeyBytes);
                content = plaintext || "[Could not decrypt]";
              } else if (m.is_encrypted) {
                content = "[Encrypted]";
              }
              return { ...m, content };
            });
            setMessages((prev) => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMsgs = decryptedMissed.filter((m: any) => !existingIds.has(m.id));
              return [...prev, ...newMsgs];
            });
          }
        } catch {
          loadMessagesRef.current?.();
        }
      } else {
        loadMessagesRef.current?.();
      }
    }
    if (!connected) {
      wasDisconnectedRef.current = true;
      setTypingUsers((prev) => (prev.size === 0 ? prev : new Map()));
    }
  }, [selectedServer, token, logout]);

  const handleServerNotification = useCallback((serverId: number) => {
    // Only mark as unread if the user is NOT currently viewing that server
    const currentServer = selectedServerRef.current;
    if (currentServer && currentServer.id === serverId) return;

    setUnreadServers(prev => {
      const next = new Set(prev);
      next.add(serverId);
      return next;
    });
  }, []);

  // When keys are updated on the server, re-fetch and re-decrypt messages
  const handleKeysUpdated = useCallback(async (serverId: number) => {
    const currentServer = selectedServerRef.current;
    if (!currentServer || currentServer.id !== serverId) return;
    // Clear cached key so we fetch the new one
    await clearServerKey(serverId);
    // Re-fetch key and reload messages
    if (myKeyPairRef.current && tokenRef.current) {
      try {
        const serverKeyData = await fetchServerKey(tokenRef.current, serverId, logoutRef.current);
        const encryptorId = serverKeyData.encrypted_by;
        const fallbackOwnerId = serversRef.current.find((s: any) => s.id === serverId)?.owner_id;
        const keyUserId = encryptorId || fallbackOwnerId;
        if (keyUserId) {
          const encryptorKeyData = await fetchPublicKey(tokenRef.current, keyUserId, logoutRef.current);
          if (encryptorKeyData.public_key) {
            const encryptorPubKey = decodeBase64(encryptorKeyData.public_key);
            const serverKeyBytes = decryptServerKey(
              serverKeyData.encrypted_key,
              serverKeyData.nonce,
              encryptorPubKey,
              myKeyPairRef.current.secretKey
            );
            if (serverKeyBytes) {
              await storeServerKey(serverId, serverKeyBytes);
              // Reload messages with the new key
              loadMessagesRef.current?.();
            }
          }
        }
      } catch {
        // Key not available for us yet
      }
    }
  }, []);

  // When another member needs a key, redistribute if we have it
  const handleKeyNeeded = useCallback(async (serverId: number, requestingUserId: number) => {
    if (!myKeyPairRef.current || !tokenRef.current) return;
    const existingKey = await getServerKey(serverId);
    if (!existingKey) return; // We don't have the key either
    // Re-encrypt the key for the requesting user
    try {
      const memberKeys = await fetchServerMemberPublicKeys(tokenRef.current, serverId, logoutRef.current);
      const encryptedKeys: { user_id: number; encrypted_key: string; nonce: string }[] = [];
      for (const member of memberKeys) {
        if (!member.public_key) continue;
        const memberPubKey = decodeBase64(member.public_key);
        const { encryptedKey, nonce } = encryptServerKeyForMember(
          existingKey,
          memberPubKey,
          myKeyPairRef.current.secretKey
        );
        encryptedKeys.push({ user_id: member.user_id, encrypted_key: encryptedKey, nonce });
      }
      if (encryptedKeys.length > 0) {
        await uploadServerKeys(tokenRef.current, serverId, encryptedKeys, logoutRef.current);
      }
    } catch {
      // Failed to redistribute — another member may handle it
    }
  }, []);

  // When a server's profile (name/icon) is updated
  const handleServerUpdated = useCallback((serverId: number, name: string, iconUrl: string | null) => {
    setServers((prev) => {
      const target = prev.find((s) => s.id === serverId);
      if (!target) return prev;
      const newIcon = iconUrl || target.icon_url;
      // Skip update if nothing actually changed
      if (target.name === name && target.icon_url === newIcon) return prev;
      return prev.map((s) => (s.id === serverId ? { ...s, name, icon_url: newIcon } : s));
    });
    const currentServer = selectedServerRef.current;
    if (currentServer && currentServer.id === serverId) {
      const newIcon = iconUrl || currentServer.icon_url;
      if (currentServer.name !== name || currentServer.icon_url !== newIcon) {
        setSelectedServer({ ...currentServer, name, icon_url: newIcon });
      }
    }
  }, []);

  // When a user's profile (username/icon) is updated
  const handleUserUpdated = useCallback((updatedUserId: number, updatedUsername: string, iconUrl: string | null) => {
    // Update messages from this user to show the new username
    // (icon updates are handled by components that fetch user data)
  }, []);

  // Ref for voice channel signaling handlers — populated after useVoiceChannel hook
  const voiceHandlersRef = useRef<{
    onUserJoined?: (channelId: number, userId: number, username: string) => void;
    onUserLeft?: (channelId: number, userId: number) => void;
    onOffer?: (channelId: number, fromUserId: number, fromUsername: string, offer: any) => void;
    onAnswer?: (channelId: number, fromUserId: number, answer: any) => void;
    onIceCandidate?: (channelId: number, fromUserId: number, candidate: any) => void;
    onChannelUsers?: (channelId: number, users: Array<{ user_id: number; username: string }>) => void;
  }>({});

  const {
    isConnected, sendTyping, sendStopTyping, sendAck, sendKeyNeeded,
    sendVoiceJoin, sendVoiceLeave, sendVoiceOffer, sendVoiceAnswer, sendVoiceIceCandidate,
  } = useWebSocket({
    serverId: selectedServer?.id ?? null,
    token,
    onNewMessage: handleWsNewMessage,
    onMessageEdited: handleWsMessageEdited,
    onMessageDeleted: handleWsMessageDeleted,
    onTyping: handleWsTyping,
    onStopTyping: handleWsStopTyping,
    onConnectionChange: handleConnectionChange,
    onServerNotification: handleServerNotification,
    onKeysUpdated: handleKeysUpdated,
    onKeyNeeded: handleKeyNeeded,
    onServerUpdated: handleServerUpdated,
    onUserUpdated: handleUserUpdated,
    onVoiceUserJoined: (channelId, uid, uname) => voiceHandlersRef.current.onUserJoined?.(channelId, uid, uname),
    onVoiceUserLeft: (channelId, uid) => voiceHandlersRef.current.onUserLeft?.(channelId, uid),
    onVoiceOffer: (channelId, fromUserId, fromUsername, offer) => voiceHandlersRef.current.onOffer?.(channelId, fromUserId, fromUsername, offer),
    onVoiceAnswer: (channelId, fromUserId, answer) => voiceHandlersRef.current.onAnswer?.(channelId, fromUserId, answer),
    onVoiceIceCandidate: (channelId, fromUserId, candidate) => voiceHandlersRef.current.onIceCandidate?.(channelId, fromUserId, candidate),
    onVoiceChannelUsers: (channelId, users) => voiceHandlersRef.current.onChannelUsers?.(channelId, users),
  });

  // Keep sendKeyNeeded ref in sync so fetchAndCacheServerKey can request key redistribution
  sendKeyNeededRef.current = sendKeyNeeded;

  // ─── Voice Channel Hook ──────────────────────────────────────────
  const voiceChannel = useVoiceChannel({
    userId: userId || 0,
    iceServers: ICE_SERVERS,
    sendVoiceJoin,
    sendVoiceLeave,
    sendVoiceOffer,
    sendVoiceAnswer,
    sendVoiceIceCandidate,
  });

  // Keep voice handlers ref in sync
  voiceHandlersRef.current = {
    onUserJoined: voiceChannel.handleVoiceUserJoined,
    onUserLeft: voiceChannel.handleVoiceUserLeft,
    onOffer: voiceChannel.handleVoiceOffer,
    onAnswer: voiceChannel.handleVoiceAnswer,
    onIceCandidate: voiceChannel.handleVoiceIceCandidate,
    onChannelUsers: voiceChannel.handleVoiceChannelUsers,
  };

  // ─── DM WebSocket callbacks ──────────────────────────────────
  const handleDmNewMessage = useCallback(async (conversationId: number, message: any) => {
    // Decrypt incoming DM if encrypted
    let decryptedContent = message.content;
    if (message.is_encrypted && message.nonce && message.sender_public_key && myKeyPairRef.current) {
      const senderPubKey = decodeBase64(message.sender_public_key);
      const plaintext = decryptDmMessage(message.content, message.nonce, senderPubKey, myKeyPairRef.current.secretKey);
      decryptedContent = plaintext || "[Could not decrypt]";
    }

    const currentSelectedId = selectedConversationIdRef.current;
    if (conversationId === currentSelectedId) {
      setDmMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, {
          id: message.id,
          username: message.username,
          content: decryptedContent,
          user_id: message.user_id,
          timestamp: message.created_at,
          attachment: message.attachment || null,
        }];
      });
    } else {
      // Mark conversation as unread if it's not currently open
      setUnreadConversations(prev => {
        const next = new Set(prev);
        next.add(conversationId);
        return next;
      });
    }
    // Move conversation to top of list instead of re-fetching the entire
    // conversations list (which caused full sidebar re-renders / screen flash).
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx === -1) {
        // Brand-new conversation — do a full fetch once
        loadConversationsRef.current();
        return prev;
      }
      if (idx === 0) return prev; // Already at top, no re-render needed
      const updated = [...prev];
      const [conv] = updated.splice(idx, 1);
      updated.unshift(conv);
      return updated;
    });
  }, []);

  const handleDmMessageEdited = useCallback(async (conversationId: number, messageId: number, content: string, isEncrypted?: boolean, nonce?: string, senderPublicKey?: string) => {
    if (conversationId !== selectedConversationIdRef.current) return;
    let decryptedContent = content;
    if (isEncrypted && nonce && senderPublicKey && myKeyPairRef.current) {
      const senderPubKey = decodeBase64(senderPublicKey);
      const plaintext = decryptDmMessage(content, nonce, senderPubKey, myKeyPairRef.current.secretKey);
      decryptedContent = plaintext || "[Could not decrypt]";
    }
    setDmMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: decryptedContent } : m))
    );
  }, []);

  const handleDmMessageDeleted = useCallback((conversationId: number, messageId: number) => {
    if (conversationId === selectedConversationIdRef.current) {
      setDmMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  }, []);

  const handleDmTyping = useCallback((conversationId: number, uid: number, uname: string) => {
    if (uid === userId || conversationId !== selectedConversationIdRef.current) return;
    setDmTypingUsers((prev) => {
      const next = new Map(prev);
      next.set(uid, uname);
      return next;
    });
    const existing = dmTypingTimeoutsRef.current.get(uid);
    if (existing) clearTimeout(existing);
    dmTypingTimeoutsRef.current.set(
      uid,
      setTimeout(() => {
        setDmTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(uid);
          return next;
        });
        dmTypingTimeoutsRef.current.delete(uid);
      }, 3000)
    );
  }, [userId]);

  const handleDmStopTyping = useCallback((conversationId: number, uid: number) => {
    if (conversationId !== selectedConversationIdRef.current) return;
    setDmTypingUsers((prev) => {
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
    const existing = dmTypingTimeoutsRef.current.get(uid);
    if (existing) {
      clearTimeout(existing);
      dmTypingTimeoutsRef.current.delete(uid);
    }
  }, []);

  const handleFriendRequest = useCallback((fromUser: any) => {
    showSnackbarRef.current(`${fromUser.username} sent you a friend request!`);
    // Update badge count immediately
    setIncomingRequestsCount(prev => prev + 1);
    // Trigger FriendsList refresh if it's open
    setFriendsRefreshTrigger(prev => prev + 1);
  }, []);

  const handleFriendAccepted = useCallback((friend: any) => {
    showSnackbarRef.current(`${friend.username} accepted your friend request!`);
    // Refresh counts since an outgoing request was accepted
    setOutgoingRequestsCount(prev => Math.max(0, prev - 1));
    // Trigger FriendsList refresh if it's open
    setFriendsRefreshTrigger(prev => prev + 1);
  }, []);

  // Ref for redistributeServerKey so we can use it before it's defined
  const redistributeServerKeyRef = useRef<((serverId: number) => Promise<void>) | null>(null);

  const handleKeyRedistributionNeeded = useCallback(async (serverId: number) => {
    // Owner received notification that a new member joined and needs the server key
    await redistributeServerKeyRef.current?.(serverId);
  }, []);

  const {
    isConnected: dmWsConnected,
    isConnecting: dmWsConnecting,
    sendDmTyping,
    sendDmStopTyping,
    sendCallOffer,
    sendCallAnswer,
    sendCallIceCandidate,
    sendCallReject,
    sendCallHangup,
  } = useDmWebSocket({
    token,
    refreshAccessToken,
    onDmNewMessage: handleDmNewMessage,
    onDmMessageEdited: handleDmMessageEdited,
    onDmMessageDeleted: handleDmMessageDeleted,
    onDmTyping: handleDmTyping,
    onDmStopTyping: handleDmStopTyping,
    onFriendRequest: handleFriendRequest,
    onFriendAccepted: handleFriendAccepted,
    onServerNotification: handleServerNotification,
    onKeyRedistributionNeeded: handleKeyRedistributionNeeded,
    // Call signaling — forward to WebRTC hook via ref
    onCallOffer: (fromUserId, fromUsername, offer, callType, callId) => {
      handleCallSignalingRef.current?.({ type: "call_offer", from_user_id: fromUserId, from_username: fromUsername, offer, call_type: callType, call_id: callId });
    },
    onCallAnswer: (fromUserId, answer, callId) => {
      handleCallSignalingRef.current?.({ type: "call_answer", from_user_id: fromUserId, answer, call_id: callId });
    },
    onCallIceCandidate: (fromUserId, candidate, callId) => {
      handleCallSignalingRef.current?.({ type: "call_ice_candidate", from_user_id: fromUserId, candidate, call_id: callId });
    },
    onCallReject: (fromUserId, callId) => {
      handleCallSignalingRef.current?.({ type: "call_reject", from_user_id: fromUserId, call_id: callId });
    },
    onCallHangup: (fromUserId, callId) => {
      handleCallSignalingRef.current?.({ type: "call_hangup", from_user_id: fromUserId, call_id: callId });
    },
  });

  // ─── WebRTC Call Hook ──────────────────────────────────────────
  const webrtc = useWebRTC({
    userId: userId || 0,
    iceServers: ICE_SERVERS,
    sendOffer: sendCallOffer,
    sendAnswer: sendCallAnswer,
    sendIceCandidate: sendCallIceCandidate,
    sendReject: sendCallReject,
    sendHangup: sendCallHangup,
  });

  // Keep signaling ref in sync
  handleCallSignalingRef.current = webrtc.handleSignalingMessage;

  const startDmCall = useCallback(async (callType: "voice" | "video") => {
    if (!activeConversation || !userId) return;
    const partner = activeConversation.members.find((m: any) => m.id !== userId);
    if (!partner) return;
    setCallMinimized(false);
    try {
      await webrtc.startCall(partner.id, partner.username, callType);
    } catch (err: any) {
      showSnackbarRef.current(err.message || "Failed to start call. HTTPS required for non-localhost.");
    }
  }, [activeConversation, userId, webrtc]);

  // Clear typing users when switching contexts
  useEffect(() => {
    setTypingUsers(new Map());
    wasDisconnectedRef.current = false;
  }, [selectedServer?.id]);

  useEffect(() => {
    setDmTypingUsers(new Map());
  }, [selectedConversationId]);

  const showSnackbar = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  }, []);

  // Update the showSnackbar ref
  showSnackbarRef.current = showSnackbar;

  // ─── Load conversations ──────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchConversations(token, logout);
      setConversations(data);
    } catch {
      // Silently fail
    }
  }, [token, logout]);

  // Ref so WS callbacks always call the latest version
  const loadConversationsRef = useRef(loadConversations);
  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    if (token) {
      loadConversations();
    }
  }, [token, loadConversations]);

  // ─── Load friend request counts ─────────────────────────────────
  const loadFriendRequestCounts = useCallback(async () => {
    if (!token) return;
    try {
      const [incoming, outgoing] = await Promise.all([
        fetchFriendRequests(token, logout),
        fetchPendingRequests(token, logout),
      ]);
      setIncomingRequestsCount(incoming.length);
      setOutgoingRequestsCount(outgoing.length);
    } catch {
      // Silently fail
    }
  }, [token, logout]);

  useEffect(() => {
    if (token) {
      loadFriendRequestCounts();
      // Poll for friend request counts every 30 seconds
      const interval = setInterval(loadFriendRequestCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [token, loadFriendRequestCounts]);

  // ─── Initialize Encryption ─────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const initEncryption = async () => {
      try {
        const keyPair = await getOrCreateKeyPair();
        myKeyPairRef.current = keyPair;
        const pubKeyB64 = encodeBase64(keyPair.publicKey);
        console.log(`[KeyDebug] initEncryption: keypair ready, publicKey=${pubKeyB64.substring(0, 20)}...`);
        // Upload our public key to the server — try with current token first
        try {
          await uploadPublicKey(token, pubKeyB64, () => {});
          console.log(`[KeyDebug] initEncryption: public key uploaded`);
          setEncryptionReady(true);
        } catch (uploadErr) {
          console.warn(`[KeyDebug] initEncryption: upload failed, trying token refresh...`, uploadErr);
          // Token might be expired — try refreshing
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            const { getSecureItem } = require("../../../utils/secureStorage");
            const newToken = await getSecureItem("token");
            if (newToken) {
              await uploadPublicKey(newToken, pubKeyB64, logout);
              console.log(`[KeyDebug] initEncryption: public key uploaded after token refresh`);
              setEncryptionReady(true);
              return;
            }
          }
          // Still set encryption ready if key pair exists — we can encrypt/decrypt locally
          console.log(`[KeyDebug] initEncryption: upload failed but setting encryptionReady anyway`);
          setEncryptionReady(true);
        }
      } catch (err) {
        console.error("[KeyDebug] initEncryption: FAILED:", err);
        // App still works, just without encryption
      }
    };
    initEncryption();
  }, [token, logout, refreshAccessToken]);

  // ─── Decrypt helper for messages ──────────────────────────────
  const decryptMessageContent = useCallback(async (msg: any, mode: "dm" | "server"): Promise<string> => {
    if (!msg.is_encrypted || !msg.nonce) return msg.content;

    const mySecretKey = myKeyPairRef.current?.secretKey;
    if (!mySecretKey) return "[Encrypted]";

    if (mode === "dm" && msg.sender_public_key) {
      const senderPubKey = decodeBase64(msg.sender_public_key);
      const plaintext = decryptDmMessage(msg.content, msg.nonce, senderPubKey, mySecretKey);
      return plaintext || "[Could not decrypt]";
    }

    if (mode === "server" && selectedServer) {
      const serverKeyBytes = await getServerKey(selectedServer.id);
      if (serverKeyBytes) {
        const plaintext = decryptServerMessage(msg.content, msg.nonce, serverKeyBytes);
        return plaintext || "[Could not decrypt]";
      }
      return "[No server key]";
    }

    return msg.content;
  }, [selectedServer]);

  // ─── Server key helpers ──────────────────────────────────────
  /** Fetch the encrypted server key from the backend, decrypt it, and cache locally */
  const fetchAndCacheServerKey = useCallback(async (serverId: number): Promise<boolean> => {
    if (!token || !myKeyPairRef.current) {
      console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): skipped — token=${!!token}, keyPair=${!!myKeyPairRef.current}`);
      return false;
    }
    try {
      console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): fetching encrypted key from backend...`);
      const serverKeyData = await fetchServerKey(token, serverId, logout);
      console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): got key data — encrypted_by=${serverKeyData.encrypted_by}, hasKey=${!!serverKeyData.encrypted_key}, hasNonce=${!!serverKeyData.nonce}`);

      // Use encrypted_by to determine whose public key we need for decryption
      // The key was encrypted with nacl.box(serverKey, nonce, ourPK, encryptorSK)
      // To decrypt we need encryptorPK + ourSK
      const encryptorId = serverKeyData.encrypted_by;
      if (!encryptorId) {
        // Legacy fallback: assume server owner encrypted it
        const serverInfo = servers.find(s => s.id === serverId);
        if (!serverInfo?.owner_id) {
          console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): no encryptorId and no owner found`);
          return false;
        }
        console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): legacy path — fetching owner ${serverInfo.owner_id} public key`);
        const ownerKeyData = await fetchPublicKey(token, serverInfo.owner_id, logout);
        if (!ownerKeyData.public_key) {
          console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): owner has no public key`);
          return false;
        }
        const ownerPubKey = decodeBase64(ownerKeyData.public_key);
        const serverKeyBytes = decryptServerKey(
          serverKeyData.encrypted_key,
          serverKeyData.nonce,
          ownerPubKey,
          myKeyPairRef.current.secretKey
        );
        if (serverKeyBytes) {
          await storeServerKey(serverId, serverKeyBytes);
          console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): decrypted and cached (legacy path)`);
          return true;
        }
        console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): decryption FAILED (legacy path) — key was encrypted for a different keypair. Requesting re-distribution...`);
        sendKeyNeededRef.current?.();
        return false;
      }
      console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): fetching encryptor ${encryptorId} public key`);
      const encryptorKeyData = await fetchPublicKey(token, encryptorId, logout);
      if (!encryptorKeyData.public_key) {
        console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): encryptor has no public key`);
        return false;
      }
      const encryptorPubKey = decodeBase64(encryptorKeyData.public_key);
      const serverKeyBytes = decryptServerKey(
        serverKeyData.encrypted_key,
        serverKeyData.nonce,
        encryptorPubKey,
        myKeyPairRef.current.secretKey
      );
      if (serverKeyBytes) {
        await storeServerKey(serverId, serverKeyBytes);
        console.log(`[KeyDebug] fetchAndCacheServerKey(${serverId}): decrypted and cached`);
        return true;
      }
      console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): decryption FAILED — key was encrypted for a different keypair. Requesting re-distribution...`);
      sendKeyNeededRef.current?.();
      return false;
    } catch (err) {
      console.warn(`[KeyDebug] fetchAndCacheServerKey(${serverId}): caught error:`, err);
      // Server key not yet distributed — request it
      sendKeyNeededRef.current?.();
      return false;
    }
  }, [token, logout, servers]);

  /** Generate a new server key and distribute it to all members (owner only) */
  const initializeServerEncryption = useCallback(async (serverId: number) => {
    if (!token || !myKeyPairRef.current) return null;
    try {
      // Generate a random symmetric key
      const serverKeyBytes = generateServerKey();
      // Fetch all member public keys
      const memberKeys = await fetchServerMemberPublicKeys(token, serverId, logout);
      const encryptedKeys: { user_id: number; encrypted_key: string; nonce: string }[] = [];
      for (const member of memberKeys) {
        if (!member.public_key) continue; // Skip members without public keys
        const memberPubKey = decodeBase64(member.public_key);
        const { encryptedKey, nonce } = encryptServerKeyForMember(
          serverKeyBytes,
          memberPubKey,
          myKeyPairRef.current.secretKey
        );
        encryptedKeys.push({
          user_id: member.user_id,
          encrypted_key: encryptedKey,
          nonce,
        });
      }
      if (encryptedKeys.length > 0) {
        await uploadServerKeys(token, serverId, encryptedKeys, logout);
      }
      // Cache locally
      await storeServerKey(serverId, serverKeyBytes);
      return serverKeyBytes;
    } catch (err) {
      console.error("Failed to initialize server encryption:", err);
      return null;
    }
  }, [token, logout]);

  /** Re-distribute the existing server key to any members who don't have it yet (owner only) */
  const redistributeServerKey = useCallback(async (serverId: number) => {
    if (!token || !myKeyPairRef.current) return;
    try {
      // Get the locally cached server key
      const existingKey = await getServerKey(serverId);
      if (!existingKey) return; // No key to redistribute

      // Fetch all member public keys and re-encrypt the key for everyone
      const memberKeys = await fetchServerMemberPublicKeys(token, serverId, logout);
      const encryptedKeys: { user_id: number; encrypted_key: string; nonce: string }[] = [];
      for (const member of memberKeys) {
        if (!member.public_key) continue;
        const memberPubKey = decodeBase64(member.public_key);
        const { encryptedKey, nonce } = encryptServerKeyForMember(
          existingKey,
          memberPubKey,
          myKeyPairRef.current.secretKey
        );
        encryptedKeys.push({ user_id: member.user_id, encrypted_key: encryptedKey, nonce });
      }
      if (encryptedKeys.length > 0) {
        await uploadServerKeys(token, serverId, encryptedKeys, logout);
      }
    } catch (err) {
      console.error("Failed to redistribute server key:", err);
    }
  }, [token, logout]);

  // Keep the ref in sync so the DM WS callback can call it
  redistributeServerKeyRef.current = redistributeServerKey;

  // ─── Check server permissions ────────────────────────────────
  const checkServerPermissions = useCallback(async (serverId: number) => {
    if (!token || !userId) return;
    // Owner always has all permissions
    const serverInfo = servers.find(s => s.id === serverId);
    if (serverInfo?.owner_id === userId) {
      setChannelPermissionDenied(false);
      setCanSendMessages(true);
      return;
    }
    try {
      const roles = await fetchUserRoles(token, serverId, userId, logout);
      const perms = roles.flatMap((r: any) => r.permissions || []);
      setCanSendMessages(perms.includes("SEND_MESSAGES"));
      // VIEW_CHANNEL will be checked when messages load (403 response)
      setChannelPermissionDenied(false);
    } catch {
      // If we can't fetch roles, assume default
      setCanSendMessages(true);
      setChannelPermissionDenied(false);
    }
  }, [token, userId, servers, logout]);

  // ─── Selection handlers ──────────────────────────────────────
  const handleSelectServer = (server: Server | null) => {
    setSelectedServer(server);
    setSelectedConversationId(null); // Deselect DM when selecting a server
    setDmMessages([]);
    setInput("");
    setEditingMessageId(null);
    // Reset permission state
    setChannelPermissionDenied(false);
    setCanSendMessages(true);
    // Clear unread marker for this server
    if (server) {
      setUnreadServers(prev => {
        if (!prev.has(server.id)) return prev;
        const next = new Set(prev);
        next.delete(server.id);
        return next;
      });
      // Check user's permissions for this server
      checkServerPermissions(server.id);
      // Redistribute server key to members who may not have it yet (non-blocking)
      // Note: loadMessagesRef.current handles fetchAndCacheServerKey before decrypting
      if (encryptionReady) {
        fetchAndCacheServerKey(server.id).then((success) => {
          if (success) redistributeServerKey(server.id);
        });
      }
    }
  };

  const handleSelectConversation = async (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setSelectedServer(null); // Deselect server when selecting a DM
    setMessages([]);
    setInput("");
    setEditingMessageId(null);
    // Clear unread marker for this conversation
    setUnreadConversations(prev => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
    // Set partner name immediately from current conversations data
    let convo = conversations.find(c => c.id === conversationId);
    if (!convo && token) {
      // Conversation not loaded yet — fetch from API
      try {
        const freshConversations = await fetchConversations(token, logout);
        setConversations(freshConversations);
        convo = freshConversations.find(c => c.id === conversationId);
      } catch {
        // Silently fail — useEffect will try again
      }
    }
    if (convo) {
      const name = getConversationDisplayName(convo);
      if (name && name !== "Unknown") {
        setDmPartnerNameOverride(name);
      }
    }
  };

  const handleOpenFriends = () => {
    // Close the mobile sidebar first to avoid nested modals
    setShowServerSidebar(false);
    // Small delay to let the sidebar modal close before opening friends
    setTimeout(() => setFriendsListOpen(true), 100);
  };

  const handleFriendsStartConversation = (conversationId: number) => {
    handleSelectConversation(conversationId);
    loadConversations();
  };

  // Load servers
  useEffect(() => {
    if (!token) return;
    apiRequest<Server[]>(
      `${API_URL}/servers`,
      { headers: { Authorization: `Bearer ${token}` } },
      logout,
      refreshAccessToken
    )
      .then((data) => {
        setServers(data);
        if (!selectedServer && !selectedConversationId && data.length > 0) {
          setSelectedServer(data[0]);
        }
      })
      .catch(() => setError("Failed to load servers"));
  }, [token, didLeaveServer]);

  // Refresh servers after leaving
  useEffect(() => {
    if (didLeaveServer && token) {
      apiRequest<Server[]>(
        `${API_URL}/servers`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout,
        refreshAccessToken
      )
        .then((data) => {
          setServers(data);
          // Select the first available server, or null if none remain
          setSelectedServer(data.length > 0 ? data[0] : null);
          setMessages([]);
          setDidLeaveServer(false);
        })
        .catch(() => {
          setError("Failed to refresh servers after leaving");
          setDidLeaveServer(false);
        });
    }
  }, [didLeaveServer, token, logout]);

  // Load server messages
  const loadMessages = async () => {
    await loadMessagesRef.current?.();
  };

  useEffect(() => {
    if (!token || !selectedServer || isDmMode || !encryptionReady) return;
    loadMessages();
    if (!isConnected) {
      const intervalId = setInterval(loadMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [token, selectedServer, isConnected, isDmMode, encryptionReady]);

  // ─── Load DM messages ────────────────────────────────────────
  const loadDmMessages = useCallback(async () => {
    if (!token || !selectedConversationId) return;
    try {
      const data = await fetchConversationMessages(token, selectedConversationId, logout);
      // Decrypt encrypted messages
      const decryptedMessages = await Promise.all(data.map(async (m: any) => {
        let content = m.content;
        if (m.is_encrypted && m.nonce && m.sender_public_key && myKeyPairRef.current) {
          const senderPubKey = decodeBase64(m.sender_public_key);
          const plaintext = decryptDmMessage(m.content, m.nonce, senderPubKey, myKeyPairRef.current.secretKey);
          content = plaintext || "[Could not decrypt]";
        }
        return {
          id: m.id,
          username: m.username,
          content,
          user_id: m.user_id,
          timestamp: m.created_at,
          attachment: m.attachment || null,
        };
      }));
      setDmMessages(decryptedMessages);
    } catch {
      setError("Failed to load messages");
    }
  }, [token, selectedConversationId, logout]);

  useEffect(() => {
    if (!token || !selectedConversationId || !isDmMode || !encryptionReady) return;
    loadDmMessages();
    // Poll as fallback when DM WS disconnected
    if (!dmWsConnected) {
      const intervalId = setInterval(loadDmMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [token, selectedConversationId, isDmMode, dmWsConnected, loadDmMessages, encryptionReady]);

  // Auto-scroll to bottom on new messages
  const currentMessages = isDmMode ? dmMessages : messages;
  useEffect(() => {
    if (currentMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [currentMessages]);

  // ─── File Upload Helpers ─────────────────────────────────────

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const readFileAsBytes = async (uri: string): Promise<Uint8Array> => {
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } else {
      // React Native: read as base64 via fetch + blob
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          resolve(new Uint8Array(arrayBuffer));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (file.size && file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 10MB.");
        return;
      }

      setPendingAttachment({
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType || "application/octet-stream",
        uri: file.uri,
      });
    } catch (err) {
      console.error("File picker error:", err);
      setError("Failed to pick file");
    }
  };

  const cancelAttachment = () => {
    setPendingAttachment(null);
  };

  const handleSendAttachment = async () => {
    if (!pendingAttachment || !token) return;
    if (!selectedServer && !selectedConversationId) return;

    setIsUploading(true);
    setError(null);

    try {
      // Read file bytes
      const fileBytes = await readFileAsBytes(pendingAttachment.uri);

      let encryptedBytes: Uint8Array;
      let encryptionNonce: string;
      let fileKeyEncrypted: string | undefined;
      let fileKeyNonce: string | undefined;
      let senderFileKeyEncrypted: string | undefined;
      let senderFileKeyNonce: string | undefined;

      if (isDmMode && selectedConversationId) {
        // DM: encrypt file with one-time key, box-encrypt file key for recipient AND sender
        if (encryptionReady && myKeyPairRef.current && activeConversation) {
          const recipient = activeConversation.members.find(m => m.id !== userId);
          if (recipient) {
            const recipientKeyData = await fetchPublicKey(token, recipient.id, logout);
            if (recipientKeyData.public_key) {
              const recipientPubKey = decodeBase64(recipientKeyData.public_key);
              const result = encryptFileBytesForDm(fileBytes, recipientPubKey, myKeyPairRef.current.secretKey, myKeyPairRef.current.publicKey);
              encryptedBytes = result.encrypted;
              encryptionNonce = result.nonce;
              fileKeyEncrypted = result.fileKeyEncrypted;
              fileKeyNonce = result.fileKeyNonce;
              senderFileKeyEncrypted = result.senderFileKeyEncrypted;
              senderFileKeyNonce = result.senderFileKeyNonce;
            } else {
              throw new Error("Recipient has no public key");
            }
          } else {
            throw new Error("No DM recipient found");
          }
        } else {
          throw new Error("Encryption not ready");
        }
      } else if (selectedServer) {
        // Server: encrypt file with server key
        let serverKeyBytes = await getServerKey(selectedServer.id);
        if (!serverKeyBytes) {
          // Key not cached yet — try fetching it now
          await fetchAndCacheServerKey(selectedServer.id);
          serverKeyBytes = await getServerKey(selectedServer.id);
        }
        if (!serverKeyBytes) throw new Error("No server encryption key available");
        const result = encryptFileBytes(fileBytes, serverKeyBytes);
        encryptedBytes = result.encrypted;
        encryptionNonce = result.nonce;
      } else {
        throw new Error("No target for upload");
      }

      // Build FormData
      const formData = new FormData();
      if (Platform.OS === "web") {
        const blob = new Blob([encryptedBytes!], { type: "application/octet-stream" });
        formData.append("file", blob, "encrypted.enc");
      } else {
        // For React Native, convert to base64 and use a data URI
        const base64 = encodeBase64(encryptedBytes!);
        formData.append("file", {
          uri: `data:application/octet-stream;base64,${base64}`,
          name: "encrypted.enc",
          type: "application/octet-stream",
        } as any);
      }

      if (selectedServer) formData.append("server_id", String(selectedServer.id));
      if (selectedConversationId) formData.append("conversation_id", String(selectedConversationId));
      formData.append("original_filename", pendingAttachment.name);
      formData.append("mime_type", pendingAttachment.mimeType);
      formData.append("file_size", String(pendingAttachment.size));
      formData.append("encryption_nonce", encryptionNonce!);
      if (fileKeyEncrypted) formData.append("file_key_encrypted", fileKeyEncrypted);
      if (fileKeyNonce) formData.append("file_key_nonce", fileKeyNonce);
      if (senderFileKeyEncrypted) formData.append("sender_file_key_encrypted", senderFileKeyEncrypted);
      if (senderFileKeyNonce) formData.append("sender_file_key_nonce", senderFileKeyNonce);

      // Upload
      const attachmentData = await uploadAttachment(formData, token, logout);

      // Send a message with the attachment
      const messageContent = input.trim() || `📎 ${pendingAttachment.name}`;
      const tempId = Date.now();

      if (isDmMode && selectedConversationId) {
        const tempMessage: Message = {
          id: tempId,
          username: username || "You",
          content: messageContent,
          user_id: userId!,
          timestamp: new Date().toISOString(),
          attachment: {
            id: attachmentData.id,
            original_filename: attachmentData.original_filename,
            mime_type: attachmentData.mime_type,
            file_size: attachmentData.file_size,
            encryption_nonce: attachmentData.encryption_nonce,
            file_key_encrypted: attachmentData.file_key_encrypted,
            file_key_nonce: attachmentData.file_key_nonce,
            sender_file_key_encrypted: attachmentData.sender_file_key_encrypted,
            sender_file_key_nonce: attachmentData.sender_file_key_nonce,
            uploader_id: userId!,
          },
        };
        setDmMessages(prev => [...prev, tempMessage]);

        let encryptionParams: any;
        if (encryptionReady && myKeyPairRef.current && activeConversation) {
          const recipient = activeConversation.members.find(m => m.id !== userId);
          if (recipient) {
            const recipientKeyData = await fetchPublicKey(token, recipient.id, logout);
            if (recipientKeyData.public_key) {
              const recipientPubKey = decodeBase64(recipientKeyData.public_key);
              const { ciphertext, nonce } = encryptDmMessage(messageContent, recipientPubKey, myKeyPairRef.current.secretKey);
              encryptionParams = {
                is_encrypted: true,
                nonce,
                sender_public_key: encodeBase64(myKeyPairRef.current.publicKey),
                attachment_id: attachmentData.id,
              };
              const result = await sendDirectMessage(token, selectedConversationId, ciphertext, logout, encryptionParams);
              setDmMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id } : m));
            }
          }
        }
      } else if (selectedServer) {
        const tempMessage: Message = {
          id: tempId,
          username: username || "You",
          content: messageContent,
          user_id: userId!,
          timestamp: new Date().toISOString(),
          attachment: {
            id: attachmentData.id,
            original_filename: attachmentData.original_filename,
            mime_type: attachmentData.mime_type,
            file_size: attachmentData.file_size,
            encryption_nonce: attachmentData.encryption_nonce,
          },
        };
        setMessages(prev => [...prev, tempMessage]);

        let encryptionParams: any;
        if (encryptionReady && myKeyPairRef.current) {
          let serverKeyBytes = await getServerKey(selectedServer.id);
          if (!serverKeyBytes) {
            await fetchAndCacheServerKey(selectedServer.id);
            serverKeyBytes = await getServerKey(selectedServer.id);
          }
          if (serverKeyBytes) {
            const { ciphertext, nonce } = encryptServerMessage(messageContent, serverKeyBytes);
            encryptionParams = {
              is_encrypted: true,
              nonce,
              sender_public_key: encodeBase64(myKeyPairRef.current.publicKey),
              attachment_id: attachmentData.id,
            };
            const result: any = await sendMessage(token, ciphertext, selectedServer.id, userId!, logout, encryptionParams);
            if (result?.message_id) {
              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.message_id } : m));
            }
          }
        }
      }

      setPendingAttachment(null);
      setInput("");
    } catch (err: any) {
      console.error("File upload error:", err);
      setError(err.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadAttachment = async (attachment: MessageAttachment) => {
    if (!token) return;

    try {
      // Use attachment metadata directly (always available, avoids RN header issues)
      const nonce = attachment.encryption_nonce;
      const fileKeyEncrypted = attachment.file_key_encrypted;
      const fileKeyNonce = attachment.file_key_nonce;
      const mimeType = attachment.mime_type;
      const filename = attachment.original_filename;

      let encryptedData: Uint8Array;

      if (Platform.OS === "web") {
        // Web: fetch + arrayBuffer works reliably
        const result = await downloadAttachment(attachment.id, token, logout);
        encryptedData = new Uint8Array(result.bytes);
      } else {
        // Mobile: RN's fetch doesn't reliably support arrayBuffer().
        // Use expo-file-system's new File API for reliable binary download.
        const tempFile = new ExpoFile(Paths.cache, `enc_${attachment.id}_${Date.now()}.tmp`);
        const downloaded = await ExpoFile.downloadFileAsync(
          `${API_URL}/attachments/${attachment.id}`,
          tempFile,
          { headers: { Authorization: `Bearer ${token}` }, idempotent: true }
        );
        const base64Enc = await downloaded.base64();
        encryptedData = decodeBase64(base64Enc);
        try { downloaded.delete(); } catch {}
      }

      let decryptedBytes: Uint8Array | null = null;

      if (fileKeyEncrypted && fileKeyNonce && isDmMode && activeConversation) {
        // DM file: decrypt the file key with nacl.box, then decrypt file
        const mySecretKey = myKeyPairRef.current?.secretKey;
        if (!mySecretKey) throw new Error("No key pair");

        // If we uploaded it ourselves, use the sender-encrypted file key
        if (attachment.uploader_id === userId && attachment.sender_file_key_encrypted && attachment.sender_file_key_nonce) {
          decryptedBytes = decryptFileBytesFromDm(
            encryptedData, nonce, attachment.sender_file_key_encrypted, attachment.sender_file_key_nonce,
            myKeyPairRef.current.publicKey, mySecretKey
          );
        }

        // Otherwise try recipient decryption with each member's public key
        if (!decryptedBytes) {
          for (const member of activeConversation.members) {
            if (member.id === userId) continue;
            try {
              const pubKeyData = await fetchPublicKey(token, member.id, logout);
              if (pubKeyData.public_key) {
                decryptedBytes = decryptFileBytesFromDm(
                  encryptedData, nonce, fileKeyEncrypted, fileKeyNonce,
                  decodeBase64(pubKeyData.public_key), mySecretKey
                );
                if (decryptedBytes) break;
              }
            } catch { /* try next member */ }
          }
        }
      } else {
        // Server file: decrypt with server key
        const serverId = selectedServer?.id || selectedServerRef.current?.id;
        if (!serverId) throw new Error("No server context");
        let serverKeyBytes = await getServerKey(serverId);
        if (!serverKeyBytes) {
          await fetchAndCacheServerKey(serverId);
          serverKeyBytes = await getServerKey(serverId);
        }
        if (!serverKeyBytes) throw new Error("No server key available. Try re-selecting the server.");
        decryptedBytes = decryptFileBytes(encryptedData, nonce, serverKeyBytes);
      }

      if (!decryptedBytes) {
        setError("Failed to decrypt file");
        return;
      }

      // Trigger download / share
      if (Platform.OS === "web") {
        const blob = new Blob([decryptedBytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Mobile: write decrypted file to cache dir and open share sheet
        const outFile = new ExpoFile(Paths.cache, filename);
        outFile.write(decryptedBytes);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(outFile.uri, {
            mimeType: mimeType,
            dialogTitle: `Save ${filename}`,
          });
        } else {
          setError("Sharing is not available on this device");
        }
      }
    } catch (err: any) {
      console.error("Download error:", err);
      setError(err.message || "Failed to download file");
    }
  };

  // ─── Unified send/edit/delete handlers ───────────────────────
  const handleSend = async () => {
    // If there's a pending attachment, send it instead
    if (pendingAttachment) {
      return handleSendAttachment();
    }
    if (!input.trim() || !token) return;
    setError(null);

    if (isDmMode && selectedConversationId) {
      // DM send
      sendDmStopTyping(selectedConversationId);
      const messageContent = input.trim();
      const tempId = Date.now();
      const tempMessage: Message = {
        id: tempId,
        username: username || "You",
        content: messageContent,
        user_id: userId!,
        timestamp: new Date().toISOString(),
      };
      setDmMessages(prev => [...prev, tempMessage]);
      setInput("");
      try {
        // Encrypt message if encryption is ready and we have a recipient
        let encryptionParams: { is_encrypted: boolean; nonce: string; sender_public_key: string } | undefined;
        if (encryptionReady && myKeyPairRef.current && activeConversation) {
          const recipient = activeConversation.members.find(m => m.id !== userId);
          if (recipient) {
            try {
              const recipientKeyData = await fetchPublicKey(token, recipient.id, logout);
              if (recipientKeyData.public_key) {
                const recipientPubKey = decodeBase64(recipientKeyData.public_key);
                const { ciphertext, nonce } = encryptDmMessage(messageContent, recipientPubKey, myKeyPairRef.current.secretKey);
                encryptionParams = {
                  is_encrypted: true,
                  nonce,
                  sender_public_key: encodeBase64(myKeyPairRef.current.publicKey),
                };
                // Send ciphertext instead of plaintext
                const result = await sendDirectMessage(token, selectedConversationId, ciphertext, logout, encryptionParams);
                setDmMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id } : m));
                loadConversationsRef.current();
                if (!dmWsConnected) await loadDmMessages();
                return;
              }
            } catch {
              // Fall through to unencrypted send
            }
          }
        }
        // Unencrypted fallback
        const result = await sendDirectMessage(token, selectedConversationId, messageContent, logout);
        setDmMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id } : m));
        loadConversationsRef.current();
        if (!dmWsConnected) await loadDmMessages();
      } catch (err: any) {
        setDmMessages(prev => prev.filter(m => m.id !== tempId));
        if (err.message?.includes("429")) {
          setError("You're sending messages too quickly. Please wait a moment.");
        } else {
          setError("Failed to send message");
        }
      }
    } else if (selectedServer) {
      // Server send
      sendStopTyping();
      const messageContent = input.trim();
      const tempId = Date.now();
      const tempMessage: Message = {
        id: tempId,
        username: username || "You",
        content: messageContent,
        user_id: userId!,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempMessage]);
      setInput("");
      try {
        // Encrypt with server key if available
        let encryptionParams: { is_encrypted: boolean; nonce: string; sender_public_key: string } | undefined;
        if (encryptionReady && myKeyPairRef.current) {
          let serverKeyBytes = await getServerKey(selectedServer.id);
          // If no server key, try fetching it
          if (!serverKeyBytes) {
            await fetchAndCacheServerKey(selectedServer.id);
            serverKeyBytes = await getServerKey(selectedServer.id);
          }
          // If still no server key and we're the owner, initialize encryption for this server
          if (!serverKeyBytes && selectedServer.owner_id === userId) {
            serverKeyBytes = await initializeServerEncryption(selectedServer.id);
          }
          if (serverKeyBytes) {
            const { ciphertext, nonce } = encryptServerMessage(messageContent, serverKeyBytes);
            encryptionParams = {
              is_encrypted: true,
              nonce,
              sender_public_key: encodeBase64(myKeyPairRef.current.publicKey),
            };
            const result: any = await sendMessage(token, ciphertext, selectedServer.id, userId!, logout, encryptionParams);
            if (!isConnected) {
              await loadMessages();
            } else if (result?.message_id) {
              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.message_id } : m));
              sendAck(result.message_id);
            }
            return;
          }
        }
        // Unencrypted fallback
        const result: any = await sendMessage(token, messageContent, selectedServer.id, userId!, logout);
        if (!isConnected) {
          await loadMessages();
        } else if (result?.message_id) {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.message_id } : m));
          sendAck(result.message_id);
        }
      } catch (err: any) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        if (err.message?.includes("429")) {
          setError("You're sending messages too quickly. Please wait a moment.");
        } else {
          setError("Failed to send message");
        }
      }
    }
  };

  const handleEditSave = async (id: number) => {
    if (!token) return;

    if (isDmMode && selectedConversationId) {
      try {
        await editDirectMessage(token, selectedConversationId, id, editContent, logout);
        // Update locally since backend only broadcasts to OTHER members
        setDmMessages(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
        setEditingMessageId(null);
      } catch {
        setError("Failed to update message");
      }
    } else if (selectedServer) {
      try {
        await updateMessage(token, id, editContent, logout);
        // Update locally since WS echo may not come back for the sender
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
        setEditingMessageId(null);
      } catch {
        setError("Failed to update message");
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;

    if (isDmMode && selectedConversationId) {
      try {
        await deleteDirectMessage(token, selectedConversationId, id, logout);
        // Remove locally since backend only broadcasts to OTHER members
        setDmMessages(prev => prev.filter(m => m.id !== id));
        setMenuVisible(false);
      } catch {
        showSnackbar("Failed to delete message");
      }
    } else if (selectedServer) {
      try {
        await deleteMessage(token, selectedServer.id, id, logout);
        // Remove locally since WS echo may not come back for the sender
        setMessages(prev => prev.filter(m => m.id !== id));
        setMenuVisible(false);
      } catch {
        showSnackbar("Failed to delete message");
      }
    }
  };

  const handleUserEdit = (user: User) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Invalid date";

    if (isMobile) {
      return date.toLocaleString(undefined, {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
    }

    return date.toLocaleString(undefined, {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const openMessageMenu = (messageId: number, content: string) => {
    setMenuMessageId(messageId);
    setMenuVisible(true);
  };

  const handleEditClick = (id: number, content: string) => {
    setEditingMessageId(id);
    setEditContent(content);
    setMenuVisible(false);
  };

  const handleDeleteClick = (id: number) => {
    setMenuVisible(false);
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this message?")) {
        handleDelete(id);
      }
    } else {
      RNAlert.alert("Delete Message", "Are you sure you want to delete this message?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDelete(id) },
      ]);
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    if (isDmMode && selectedConversationId) {
      // DM typing indicator
      if (text.trim() && !dmTypingThrottleRef.current) {
        sendDmTyping(selectedConversationId);
        dmTypingThrottleRef.current = setTimeout(() => {
          dmTypingThrottleRef.current = null;
        }, 2000);
      }
      if (!text.trim()) {
        sendDmStopTyping(selectedConversationId);
        if (dmTypingThrottleRef.current) {
          clearTimeout(dmTypingThrottleRef.current);
          dmTypingThrottleRef.current = null;
        }
      }
    } else {
      // Server typing indicator
      if (text.trim() && !typingThrottleRef.current) {
        sendTyping();
        typingThrottleRef.current = setTimeout(() => {
          typingThrottleRef.current = null;
        }, 2000);
      }
      if (!text.trim()) {
        sendStopTyping();
        if (typingThrottleRef.current) {
          clearTimeout(typingThrottleRef.current);
          typingThrottleRef.current = null;
        }
      }
    }
  };

  // Get the active typing users for the current mode
  const activeTypingUsers = isDmMode ? dmTypingUsers : typingUsers;
  const activeWsConnected = isDmMode ? dmWsConnected : isConnected;
  
  // Show reconnecting only when actively trying to connect
  const showReconnecting = isDmMode ? dmWsConnecting : (!isConnected && !isDmMode);

  // Determine header title - show "@username" for DMs
  const dmPartnerName = isDmMode
    ? (activeConversation ? getConversationDisplayName(activeConversation) : dmPartnerNameOverride)
    : null;
  // ─── Stable ref for image decrypt context ─────────────────────
  const imageDecryptCtxRef = useRef<ImageDecryptContext>({
    token, logout, isDmMode, activeConversation, userId,
    myKeyPairRef, selectedServerRef, getServerKey,
    fetchAndCacheServerKey, handleDownloadAttachment,
  });
  // Keep in sync every render (cheap — just ref assignment, no re-render)
  imageDecryptCtxRef.current = {
    token, logout, isDmMode, activeConversation, userId,
    myKeyPairRef, selectedServerRef, getServerKey,
    fetchAndCacheServerKey, handleDownloadAttachment,
  };

  const renderMessage = ({ item: msg }: { item: Message }) => (
    <MessageBubble
      msg={msg}
      editingMessageId={editingMessageId}
      editContent={editContent}
      onEditContentChange={setEditContent}
      onEditSave={handleEditSave}
      onEditCancel={() => setEditingMessageId(null)}
      onUserPress={(uid, uname) => handleUserEdit({ id: uid, username: uname })}
      onLongPress={(id) => openMessageMenu(id, "")}
      onMorePress={(id) => openMessageMenu(id, "")}
      formatTimestamp={formatTimestamp}
      isMobile={isMobile}
      userId={userId}
      imageDecryptCtxRef={imageDecryptCtxRef}
      onDownloadAttachment={handleDownloadAttachment}
    />
  );

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/(tabs)/pages/Login");
    }
  }, [token, authLoading]);

  if (authLoading || !token) {
    return null;
  }

  const hasSelection = selectedServer || isDmMode;

  return (
    <Theme name="dark">
      <YStack flex={1} backgroundColor="#2f3136" paddingTop={insets.top}>
        <XStack flex={1}>
          {/* Left Sidebar - Desktop: Always visible, Mobile: Modal */}
          {isDesktop ? (
            <ServerSidebar
              servers={servers}
              selectedServer={selectedServer}
              setSelectedServer={handleSelectServer}
              setServers={setServers}
              token={token}
              setError={setError}
              logout={logout}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              conversations={conversations}
              onConversationsChanged={loadConversations}
              userId={userId!}
              incomingRequestsCount={incomingRequestsCount}
              outgoingRequestsCount={outgoingRequestsCount}
              unreadDmCount={unreadDmCount}
              unreadConversations={unreadConversations}
              unreadServers={unreadServers}
              onOpenFriends={() => setFriendsListOpen(true)}
            />
          ) : (
            <Modal
              visible={showServerSidebar}
              transparent
              animationType="slide"
              onRequestClose={() => setShowServerSidebar(false)}
            >
              <Pressable
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
                onPress={() => setShowServerSidebar(false)}
              >
                <YStack
                  width="80%"
                  maxWidth={300}
                  height="100%"
                  backgroundColor="#2f3136"
                  paddingTop={insets.top}
                >
                  <XStack
                    padding="$4"
                    justifyContent="space-between"
                    alignItems="center"
                    borderBottomWidth={1}
                    borderBottomColor="#202225"
                  >
                    <Text fontSize="$6" fontWeight="700" color="white">
                      Messages
                    </Text>
                    <TouchableOpacity onPress={() => setShowServerSidebar(false)}>
                      <CloseIcon size={24} color="#b9bbbe" />
                    </TouchableOpacity>
                  </XStack>
                  <ServerSidebar
                    servers={servers}
                    selectedServer={selectedServer}
                    setSelectedServer={(server) => {
                      handleSelectServer(server);
                      setShowServerSidebar(false);
                    }}
                    setServers={setServers}
                    token={token}
                    setError={setError}
                    logout={logout}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={(id) => {
                      handleSelectConversation(id);
                      setShowServerSidebar(false);
                    }}
                    conversations={conversations}
                    onConversationsChanged={loadConversations}
                    userId={userId!}
                    incomingRequestsCount={incomingRequestsCount}
                    outgoingRequestsCount={outgoingRequestsCount}
                    unreadDmCount={unreadDmCount}
                    unreadConversations={unreadConversations}
                    unreadServers={unreadServers}
                    onOpenFriends={handleOpenFriends}
                  />
                </YStack>
              </Pressable>
            </Modal>
          )}

          {/* Center Chat Panel */}
          {hasSelection ? (
            <YStack flex={1} backgroundColor="#36393f">
              <ChatHeader
                isDmMode={isDmMode}
                dmPartnerName={dmPartnerName}
                selectedServer={selectedServer}
                isMobile={isMobile}
                isDesktop={isDesktop}
                showReconnecting={showReconnecting}
                callState={webrtc.callState}
                unreadDmCount={unreadDmCount}
                unreadServerCount={unreadServers.size}
                activeConversation={activeConversation}
                onToggleServerSidebar={() => setShowServerSidebar(true)}
                onToggleUserSidebar={() => setShowUserSidebar(true)}
                onOpenSettings={() => setIsServerSettingsOpen(true)}
                onStartCall={startDmCall}
              />

              {/* Active call minimized bar */}
              {callMinimized && (webrtc.callState.status === "connected" || webrtc.callState.status === "calling") && (
                <ActiveCallOverlay
                  callState={webrtc.callState}
                  onHangUp={() => webrtc.hangUp()}
                  onToggleMute={() => webrtc.toggleMute()}
                  onToggleVideo={() => webrtc.toggleVideo()}
                  minimized={true}
                  onToggleMinimize={() => setCallMinimized(false)}
                />
              )}

              {/* Voice Channel Panel - server mode only */}
              {!isDmMode && selectedServer && token && (
                <VoiceChannelPanel
                  token={token}
                  serverId={selectedServer.id}
                  userId={userId || 0}
                  logout={logout}
                  voiceState={voiceChannel.voiceState}
                  onJoinChannel={async (channelId) => {
                    try {
                      await voiceChannel.joinChannel(channelId);
                    } catch (err: any) {
                      showSnackbarRef.current(err.message || "Failed to join voice channel. HTTPS required for non-localhost.");
                    }
                  }}
                  onLeaveChannel={() => voiceChannel.leaveChannel()}
                  onToggleMute={() => voiceChannel.toggleMute()}
                />
              )}

              {/* Messages List */}
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === "ios" ? (isMobile ? 90 : 100) : 0}
              >
                <YStack flex={1} backgroundColor="#36393f">
                  {error && !channelPermissionDenied && (
                    <Card
                      backgroundColor="#f44336"
                      padding="$3"
                      margin="$3"
                      borderRadius="$3"
                    >
                      <Text color="white" fontWeight="600" fontSize={isMobile ? "$3" : "$2"}>
                        {error}
                      </Text>
                    </Card>
                  )}
                  {channelPermissionDenied && !isDmMode ? (
                    <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
                      <YStack
                        backgroundColor="rgba(255, 152, 0, 0.15)"
                        borderWidth={1}
                        borderColor="#ff9800"
                        borderRadius="$4"
                        padding="$4"
                        maxWidth={400}
                        alignItems="center"
                        gap="$2"
                      >
                        <Text color="#ff9800" fontWeight="700" fontSize="$5" textAlign="center">
                          Permission Denied
                        </Text>
                        <Text color="#ffb74d" fontSize="$3" textAlign="center">
                          You don't have permission to view messages in this channel. Contact a server admin to update your role.
                        </Text>
                      </YStack>
                    </YStack>
                  ) : (
                    <FlatList
                      ref={flatListRef}
                      data={currentMessages}
                      renderItem={renderMessage}
                      keyExtractor={(item) => item.id.toString()}
                      contentContainerStyle={{
                        padding: isMobile ? 12 : 16,
                        paddingBottom: 16
                      }}
                      onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    />
                  )}
                </YStack>

                <TypingIndicator typingUsers={activeTypingUsers} isMobile={isMobile} />

                <ChatInput
                  input={input}
                  onInputChange={handleInputChange}
                  onSend={handleSend}
                  onPickFile={handlePickFile}
                  onCancelAttachment={cancelAttachment}
                  pendingAttachment={pendingAttachment}
                  isUploading={isUploading}
                  canSendMessages={canSendMessages}
                  channelPermissionDenied={channelPermissionDenied}
                  isMobile={isMobile}
                  isDmMode={isDmMode}
                  selectedServer={selectedServer}
                  activeConversation={activeConversation}
                  getConversationDisplayName={getConversationDisplayName}
                  bottomInset={insets.bottom}
                />
              </KeyboardAvoidingView>
            </YStack>
          ) : (
            <EmptyState
              isDesktop={isDesktop}
              isMobile={isMobile}
              topInset={insets.top}
              hasServers={servers.length > 0}
              hasConversations={conversations.length > 0}
              onOpenSidebar={() => setShowServerSidebar(true)}
            />
          )}

          {/* Right Sidebar - Desktop only, server mode only */}
          {isDesktop && selectedServer && !isDmMode && showUserSidebar && (
            <RightSidebar
              selectedServer={selectedServer}
              token={token}
              userId={userId!}
              onUserClick={handleUserEdit}
              onClose={() => setShowUserSidebar(false)}
              logout={logout}
            />
          )}
        </XStack>

        <MessageOptionsModal
          visible={menuVisible}
          isMobile={isMobile}
          isOwnMessage={currentMessages.find((m) => m.id === menuMessageId)?.user_id === userId}
          onClose={() => setMenuVisible(false)}
          onEdit={() => {
            const msg = currentMessages.find((m) => m.id === menuMessageId);
            if (msg) handleEditClick(msg.id, msg.content);
          }}
          onDelete={() => menuMessageId && handleDeleteClick(menuMessageId)}
        />

        {/* Settings Dialog - Only in server mode */}
        {isServerSettingsOpen && selectedServer && !isDmMode && (
          <SettingsDialog
            open={isServerSettingsOpen}
            onClose={() => setIsServerSettingsOpen(false)}
            selectedServer={selectedServer}
            token={token}
            userId={userId!}
            setServers={setServers}
            setSelectedServer={setSelectedServer}
            setDidLeaveServer={setDidLeaveServer}
            logout={logout}
          />
        )}

        {/* User Profile Dialog */}
        {isUserDialogOpen && selectedUser && (
          <UserProfileDialog
            open={isUserDialogOpen}
            onClose={() => setIsUserDialogOpen(false)}
            user={selectedUser}
            currentUserId={userId!}
            selectedServer={selectedServer}
            token={token}
            logout={logout}
            isDmMode={isDmMode}
            activeConversation={activeConversation}
          />
        )}

        {/* Friends List Modal - rendered at root level to avoid nested Modal issues on mobile */}
        <FriendsList
          open={friendsListOpen}
          onClose={() => {
            setFriendsListOpen(false);
            // Refresh badge counts when closing friends list
            loadFriendRequestCounts();
          }}
          onStartConversation={handleFriendsStartConversation}
          refreshTrigger={friendsRefreshTrigger}
        />

        {/* ─── Call UI ──────────────────────────────────────────── */}
        <IncomingCallModal
          visible={webrtc.callState.status === "ringing"}
          callerName={webrtc.callState.remoteUsername || "Unknown"}
          callType={webrtc.callState.callType}
          onAccept={async () => {
            setCallMinimized(false);
            await webrtc.acceptCall();
          }}
          onReject={() => webrtc.rejectCall()}
        />

        {!callMinimized && (
          <ActiveCallOverlay
            callState={webrtc.callState}
            onHangUp={() => webrtc.hangUp()}
            onToggleMute={() => webrtc.toggleMute()}
            onToggleVideo={() => webrtc.toggleVideo()}
            minimized={false}
            onToggleMinimize={() => setCallMinimized(true)}
            audioDevices={webrtc.audioDevices}
            selectedMicId={webrtc.selectedMicId}
            selectedSpeakerId={webrtc.selectedSpeakerId}
            onSelectMic={webrtc.switchMicrophone}
            onSelectSpeaker={webrtc.switchSpeaker}
            onRefreshDevices={webrtc.enumerateAudioDevices}
          />
        )}

        {/* Call ended toast */}
        {webrtc.callState.status === "ended" && (
          <Card
            position="absolute"
            top={100}
            alignSelf="center"
            backgroundColor="#36393f"
            borderWidth={1}
            borderColor="#5865F2"
            padding="$3"
            borderRadius="$4"
            shadowColor="black"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.3}
            shadowRadius={8}
          >
            <Text color="#b9bbbe" fontSize="$3">Call ended</Text>
          </Card>
        )}

        <SnackbarToast
          visible={snackbarVisible}
          message={snackbarMessage}
          bottomInset={insets.bottom}
          isMobile={isMobile}
        />
      </YStack>
    </Theme>
  );
};

export default ChatPage;
