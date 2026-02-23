import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  YStack,
  XStack,
  Text,
  Input,
  Button,
  Card,
  Theme,
  Spinner,
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
  Settings,
  MoreVertical,
  Edit3,
  Trash2,
  Menu,
  X as CloseIcon,
  Send,
  Hash,
  Users,
  WifiOff,
  MessageCircle,
} from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ServerSidebar from "./components/ServerSidebar";
import RightSidebar from "./components/RightSidebar";
import SettingsDialog from "./components/SettingsDialog";
import UserProfileDialog from "./components/UserProfileDialog";
import FriendsList from "./components/FriendsList";
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
  ConversationData,
  DirectMessageData,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { useWebSocket } from "../utils/useWebSocket";
import { useDmWebSocket } from "../utils/useDmWebSocket";
import { API_URL } from "../utils/config";
import {
  encryptDmMessage,
  decryptDmMessage,
  encryptServerMessage,
  decryptServerMessage,
  encryptServerKeyForMember,
  decryptServerKey,
  generateServerKey,
  encodeBase64,
  decodeBase64,
} from "../utils/encryption";
import { getOrCreateKeyPair, getPrivateKey, getServerKey, storeServerKey, clearServerKey } from "../utils/keyManager";

interface Message {
  id: number;
  username: string;
  content: string;
  user_id: number;
  timestamp: string;
}

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface User {
  id: number;
  username: string;
}

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

  const handleWsMessageEdited = useCallback((messageId: number, content: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content } : m))
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
      // Decrypt server messages — try to get the cached key first
      let serverKeyBytes = await getServerKey(selectedServer.id);
      // If no cached key but there are encrypted messages, try to fetch it now
      const hasEncrypted = data.some((m: any) => m.is_encrypted);
      if (!serverKeyBytes && hasEncrypted && token && myKeyPairRef.current) {
        // Retry up to 3 times with a delay (another member may be redistributing keys)
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const serverKeyData = await fetchServerKey(token, selectedServer.id, logout);
            // Use encrypted_by to get the correct public key for decryption
            const encryptorId = serverKeyData.encrypted_by;
            const fallbackOwnerId = servers.find(s => s.id === selectedServer.id)?.owner_id;
            const keyUserId = encryptorId || fallbackOwnerId;
            if (keyUserId) {
              const encryptorKeyData = await fetchPublicKey(token, keyUserId, logout);
              if (encryptorKeyData.public_key) {
                const encryptorPubKey = decodeBase64(encryptorKeyData.public_key);
                const decryptedKey = decryptServerKey(
                  serverKeyData.encrypted_key,
                  serverKeyData.nonce,
                  encryptorPubKey,
                  myKeyPairRef.current!.secretKey
                );
                if (decryptedKey) {
                  await storeServerKey(selectedServer.id, decryptedKey);
                  serverKeyBytes = decryptedKey;
                  break;
                }
              }
            }
          } catch {
            // Key not available yet — wait and retry
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
      }
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
            setMessages((prev) => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMsgs = missed.filter(m => !existingIds.has(m.id));
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
      setTypingUsers(new Map());
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
    setServers((prev) =>
      prev.map((s) => (s.id === serverId ? { ...s, name, icon_url: iconUrl || s.icon_url } : s))
    );
    const currentServer = selectedServerRef.current;
    if (currentServer && currentServer.id === serverId) {
      setSelectedServer({ ...currentServer, name, icon_url: iconUrl || currentServer.icon_url });
    }
  }, []);

  // When a user's profile (username/icon) is updated
  const handleUserUpdated = useCallback((updatedUserId: number, updatedUsername: string, iconUrl: string | null) => {
    // Update messages from this user to show the new username
    // (icon updates are handled by components that fetch user data)
  }, []);

  const { isConnected, sendTyping, sendStopTyping, sendAck, sendKeyNeeded } = useWebSocket({
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
  });

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
    // Refresh conversations list so new DMs appear in receiver's sidebar
    loadConversationsRef.current();
  }, []);

  const handleDmMessageEdited = useCallback((conversationId: number, messageId: number, content: string) => {
    if (conversationId === selectedConversationIdRef.current) {
      setDmMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content } : m))
      );
    }
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

  const { isConnected: dmWsConnected, isConnecting: dmWsConnecting, sendDmTyping, sendDmStopTyping } = useDmWebSocket({
    token,
    onDmNewMessage: handleDmNewMessage,
    onDmMessageEdited: handleDmMessageEdited,
    onDmMessageDeleted: handleDmMessageDeleted,
    onDmTyping: handleDmTyping,
    onDmStopTyping: handleDmStopTyping,
    onFriendRequest: handleFriendRequest,
    onFriendAccepted: handleFriendAccepted,
    onServerNotification: handleServerNotification,
    onKeyRedistributionNeeded: handleKeyRedistributionNeeded,
  });

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
        // Upload our public key to the server
        await uploadPublicKey(token, encodeBase64(keyPair.publicKey), logout);
        setEncryptionReady(true);
      } catch (err) {
        console.error("Failed to initialize encryption:", err);
        // App still works, just without encryption
      }
    };
    initEncryption();
  }, [token, logout]);

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
    if (!token || !myKeyPairRef.current) return false;
    try {
      const serverKeyData = await fetchServerKey(token, serverId, logout);
      // Use encrypted_by to determine whose public key we need for decryption
      // The key was encrypted with nacl.box(serverKey, nonce, ourPK, encryptorSK)
      // To decrypt we need encryptorPK + ourSK
      const encryptorId = serverKeyData.encrypted_by;
      if (!encryptorId) {
        // Legacy fallback: assume server owner encrypted it
        const serverInfo = servers.find(s => s.id === serverId);
        if (!serverInfo?.owner_id) return false;
        const ownerKeyData = await fetchPublicKey(token, serverInfo.owner_id, logout);
        if (!ownerKeyData.public_key) return false;
        const ownerPubKey = decodeBase64(ownerKeyData.public_key);
        const serverKeyBytes = decryptServerKey(
          serverKeyData.encrypted_key,
          serverKeyData.nonce,
          ownerPubKey,
          myKeyPairRef.current.secretKey
        );
        if (serverKeyBytes) {
          await storeServerKey(serverId, serverKeyBytes);
          return true;
        }
        return false;
      }
      const encryptorKeyData = await fetchPublicKey(token, encryptorId, logout);
      if (!encryptorKeyData.public_key) return false;
      const encryptorPubKey = decodeBase64(encryptorKeyData.public_key);
      const serverKeyBytes = decryptServerKey(
        serverKeyData.encrypted_key,
        serverKeyData.nonce,
        encryptorPubKey,
        myKeyPairRef.current.secretKey
      );
      if (serverKeyBytes) {
        await storeServerKey(serverId, serverKeyBytes);
        return true;
      }
      return false;
    } catch {
      // Server key not yet distributed — that's okay
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
      // Fetch and cache server encryption key in background
      // Then redistribute to any members who don't have it (any key-holder can do this)
      if (encryptionReady) {
        fetchAndCacheServerKey(server.id).then((success) => {
          if (success) {
            redistributeServerKey(server.id);
          }
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
    if (!token || !selectedServer || isDmMode) return;
    loadMessages();
    if (!isConnected) {
      const intervalId = setInterval(loadMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [token, selectedServer, isConnected, isDmMode]);

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
        };
      }));
      setDmMessages(decryptedMessages);
    } catch {
      setError("Failed to load messages");
    }
  }, [token, selectedConversationId, logout]);

  useEffect(() => {
    if (!token || !selectedConversationId || !isDmMode) return;
    loadDmMessages();
    // Poll as fallback when DM WS disconnected
    if (!dmWsConnected) {
      const intervalId = setInterval(loadDmMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [token, selectedConversationId, isDmMode, dmWsConnected, loadDmMessages]);

  // Auto-scroll to bottom on new messages
  const currentMessages = isDmMode ? dmMessages : messages;
  useEffect(() => {
    if (currentMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [currentMessages]);

  // ─── Unified send/edit/delete handlers ───────────────────────
  const handleSend = async () => {
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
          // If no server key and we're the owner, initialize encryption for this server
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
  const headerTitle = isDmMode
    ? (dmPartnerName ? `@${dmPartnerName}` : "Direct Message")
    : selectedServer?.name || "";

  const headerIcon = isDmMode
    ? <MessageCircle size={isMobile ? 20 : 24} color="#72767d" />
    : <Hash size={isMobile ? 20 : 24} color="#72767d" />;

  const renderMessage = ({ item: msg }: { item: Message }) => (
    <Pressable
      onLongPress={() => openMessageMenu(msg.id, msg.content)}
      delayLongPress={300}
      style={{ marginBottom: isMobile ? 12 : 8 }}
    >
      <Card
        backgroundColor={editingMessageId === msg.id ? "#40444b" : "#2c2f33"}
        padding={isMobile ? "$3" : "$3"}
        borderRadius="$3"
      >
        {editingMessageId === msg.id ? (
          <YStack gap="$2">
            <Input
              value={editContent}
              onChangeText={setEditContent}
              multiline
              numberOfLines={4}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              placeholder="Edit your message"
              placeholderTextColor="#72767d"
              autoFocus
              fontSize={isMobile ? "$4" : "$3"}
            />
            <XStack justifyContent="flex-end" gap="$2">
              <Button
                size="$3"
                onPress={() => setEditingMessageId(null)}
                backgroundColor="#40444b"
              >
                Cancel
              </Button>
              <Button
                size="$3"
                onPress={() => handleEditSave(msg.id)}
                backgroundColor="#5865F2"
              >
                Save
              </Button>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$1">
            <XStack alignItems="center" justifyContent="space-between">
              <XStack alignItems="center" flex={1} gap="$2">
                <Pressable onPress={() => handleUserEdit({ id: msg.user_id, username: msg.username })}>
                  <Text fontWeight="700" color="white" fontSize={isMobile ? "$5" : "$4"}>
                    {msg.username}
                  </Text>
                </Pressable>
                <Text fontSize={isMobile ? "$2" : "$1"} color="#72767d">
                  {formatTimestamp(msg.timestamp)}
                </Text>
              </XStack>
              <TouchableOpacity onPress={() => openMessageMenu(msg.id, msg.content)}>
                <MoreVertical size={20} color="#b9bbbe" />
              </TouchableOpacity>
            </XStack>
            <Text color="#dcddde" fontSize={isMobile ? "$4" : "$3"} lineHeight={isMobile ? 22 : 20}>
              {msg.content}
            </Text>
          </YStack>
        )}
      </Card>
    </Pressable>
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
              {/* Header */}
              <XStack
                height={isMobile ? 56 : 64}
                paddingHorizontal={isMobile ? "$3" : "$4"}
                alignItems="center"
                justifyContent="space-between"
                backgroundColor="#2f3136"
                borderBottomWidth={1}
                borderBottomColor="#202225"
              >
                <XStack alignItems="center" gap="$3" flex={1}>
                  {!isDesktop && (
                    <TouchableOpacity onPress={() => setShowServerSidebar(true)} style={{ position: 'relative' }}>
                      <Menu size={24} color="#b9bbbe" />
                      {(unreadDmCount + unreadServers.size) > 0 && (
                        <YStack
                          position="absolute"
                          right={-6}
                          top={-6}
                          backgroundColor="#f04747"
                          borderRadius={8}
                          minWidth={16}
                          height={16}
                          justifyContent="center"
                          alignItems="center"
                          paddingHorizontal={4}
                        >
                          <Text color="white" fontSize={10} fontWeight="700">
                            {(unreadDmCount + unreadServers.size) > 9 ? "9+" : (unreadDmCount + unreadServers.size)}
                          </Text>
                        </YStack>
                      )}
                    </TouchableOpacity>
                  )}
                  {headerIcon}
                  <Text
                    fontSize={isMobile ? "$5" : "$7"}
                    fontWeight="600"
                    color="white"
                    numberOfLines={1}
                    flex={1}
                  >
                    {headerTitle}
                  </Text>
                </XStack>
                <XStack gap="$2" alignItems="center">
                  {showReconnecting && (
                    <XStack
                      backgroundColor="rgba(240,71,71,0.2)"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$2"
                      alignItems="center"
                      gap="$1"
                    >
                      <WifiOff size={14} color="#f04747" />
                      {!isMobile && (
                        <Text color="#f04747" fontSize="$1" fontWeight="600">
                          Reconnecting
                        </Text>
                      )}
                    </XStack>
                  )}
                  {/* Only show Users and Settings buttons in server mode */}
                  {!isDmMode && (
                    <>
                      {!isMobile && (
                        <Button
                          size="$3"
                          backgroundColor="transparent"
                          borderWidth={1}
                          borderColor="#5865F2"
                          icon={<Users size={16} color="#5865F2" />}
                          onPress={() => setShowUserSidebar(true)}
                          pressStyle={{
                            backgroundColor: "rgba(88,101,242,0.1)",
                          }}
                        />
                      )}
                      <Button
                        size="$3"
                        backgroundColor="transparent"
                        borderWidth={1}
                        borderColor="#5865F2"
                        icon={<Settings size={16} color="#5865F2" />}
                        onPress={() => setIsServerSettingsOpen(true)}
                        pressStyle={{
                          backgroundColor: "rgba(88,101,242,0.1)",
                        }}
                      >
                        {!isMobile && "Settings"}
                      </Button>
                    </>
                  )}
                </XStack>
              </XStack>

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

                {/* Typing Indicator */}
                {activeTypingUsers.size > 0 && (
                  <XStack
                    paddingHorizontal={isMobile ? "$3" : "$4"}
                    paddingVertical="$1"
                    backgroundColor="#36393f"
                  >
                    <Text color="#72767d" fontSize="$2" fontStyle="italic">
                      {(() => {
                        const names = Array.from(activeTypingUsers.values());
                        if (names.length === 1) return `${names[0]} is typing...`;
                        if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
                        return `${names[0]} and ${names.length - 1} others are typing...`;
                      })()}
                    </Text>
                  </XStack>
                )}

                {/* Input Box */}
                {(!isDmMode && (!canSendMessages || channelPermissionDenied)) ? (
                  <XStack
                    padding={isMobile ? "$2" : "$3"}
                    paddingBottom={Platform.OS === "ios" ? insets.bottom : (isMobile ? "$2" : "$3")}
                    backgroundColor="#2f3136"
                    borderTopWidth={1}
                    borderTopColor="#202225"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <YStack
                      flex={1}
                      backgroundColor="rgba(255, 152, 0, 0.1)"
                      borderWidth={1}
                      borderColor="rgba(255, 152, 0, 0.3)"
                      borderRadius="$4"
                      padding="$3"
                      alignItems="center"
                    >
                      <Text color="#ff9800" fontSize={isMobile ? "$3" : "$2"} textAlign="center">
                        You do not have permission to send messages in this channel.
                      </Text>
                    </YStack>
                  </XStack>
                ) : (
                  <XStack
                    padding={isMobile ? "$2" : "$3"}
                    paddingBottom={Platform.OS === "ios" ? insets.bottom : (isMobile ? "$2" : "$3")}
                    backgroundColor="#2f3136"
                    borderTopWidth={1}
                    borderTopColor="#202225"
                    alignItems="flex-end"
                    gap="$2"
                  >
                    <Input
                      flex={1}
                      placeholder={isDmMode && activeConversation
                        ? `Message ${getConversationDisplayName(activeConversation)}`
                        : selectedServer
                          ? `Message ${selectedServer.name}`
                          : "Type a message..."
                      }
                      value={input}
                      onChangeText={handleInputChange}
                      multiline
                      numberOfLines={1}
                      maxLength={2000}
                      backgroundColor="#40444b"
                      borderWidth={0}
                      color="white"
                      borderRadius="$4"
                      padding={isMobile ? "$3" : "$3"}
                      fontSize={isMobile ? "$4" : "$3"}
                      onSubmitEditing={isMobile ? undefined : handleSend}
                    />
                    <Button
                      backgroundColor="#5865F2"
                      onPress={handleSend}
                      disabled={!input.trim()}
                      pressStyle={{
                        backgroundColor: "#4752c4",
                      }}
                      disabledStyle={{
                        opacity: 0.5,
                      }}
                      size={isMobile ? "$4" : "$3"}
                      icon={isMobile ? <Send size={20} color="white" /> : undefined}
                    >
                      {!isMobile && "Send"}
                    </Button>
                  </XStack>
                )}
              </KeyboardAvoidingView>
            </YStack>
          ) : (
            <YStack
              flex={1}
              backgroundColor="#36393f"
              justifyContent="center"
              alignItems="center"
              padding="$4"
            >
              {!isDesktop && (
                <TouchableOpacity
                  onPress={() => setShowServerSidebar(true)}
                  style={{ position: 'absolute', top: 20 + insets.top, left: 20 }}
                >
                  <Menu size={28} color="#b9bbbe" />
                </TouchableOpacity>
              )}
              <Text color="#72767d" fontSize={isMobile ? "$5" : "$6"} fontWeight="600" textAlign="center">
                {servers.length === 0 && conversations.length === 0
                  ? "Add friends or create a server to start chatting"
                  : "Select a conversation to start chatting"}
              </Text>
            </YStack>
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

        {/* Message Options Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20
            }}
            onPress={() => setMenuVisible(false)}
          >
            <Card
              backgroundColor="#2f3136"
              padding="$0"
              borderRadius="$4"
              width={isMobile ? "90%" : 200}
              maxWidth={300}
            >
              <YStack>
                {currentMessages.find((m) => m.id === menuMessageId)?.user_id === userId && (
                  <Pressable
                    onPress={() => {
                      const msg = currentMessages.find((m) => m.id === menuMessageId);
                      if (msg) handleEditClick(msg.id, msg.content);
                    }}
                  >
                    <XStack
                      padding={isMobile ? "$4" : "$3"}
                      gap="$3"
                      alignItems="center"
                    >
                      <Edit3 size={isMobile ? 20 : 16} color="white" />
                      <Text color="white" fontSize={isMobile ? "$4" : "$3"}>Edit</Text>
                    </XStack>
                  </Pressable>
                )}
                <Pressable onPress={() => menuMessageId && handleDeleteClick(menuMessageId)}>
                  <XStack
                    padding={isMobile ? "$4" : "$3"}
                    gap="$3"
                    alignItems="center"
                  >
                    <Trash2 size={isMobile ? 20 : 16} color="#f04747" />
                    <Text color="#f04747" fontSize={isMobile ? "$4" : "$3"}>Delete</Text>
                  </XStack>
                </Pressable>
              </YStack>
            </Card>
          </Pressable>
        </Modal>

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

        {/* Snackbar */}
        {snackbarVisible && (
          <Card
            position="absolute"
            bottom={insets.bottom + 20}
            alignSelf="center"
            backgroundColor="#323232"
            padding={isMobile ? "$4" : "$3"}
            borderRadius="$4"
            marginHorizontal="$4"
            maxWidth={isMobile ? "90%" : 400}
            shadowColor="black"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.3}
            shadowRadius={8}
          >
            <Text color="white" fontSize={isMobile ? "$4" : "$3"}>{snackbarMessage}</Text>
          </Card>
        )}
      </YStack>
    </Theme>
  );
};

export default ChatPage;
