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
  ActivityIndicator,
  ScrollView,
} from "react-native";
import {
  Menu,
  X as CloseIcon,
  ChevronDown,
  ChevronRight,
  Sparkles,
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
import ChatHeader from "./chat_components/ChatHeader";
import ChatInput from "./chat_components/ChatInput";
import MessageBubble from "./chat_components/MessageBubble";
import MessageOptionsModal from "./chat_components/MessageOptionsModal";
import EmojiPicker from "./chat_components/EmojiPicker";
import EmptyState from "./chat_components/EmptyState";
import TypingIndicator from "./chat_components/TypingIndicator";
import SnackbarToast from "./chat_components/SnackbarToast";
import DocumentListPanel from "./chat_components/collab/DocumentListPanel";
import DocumentEditor from "./chat_components/collab/DocumentEditor";
import WhiteboardEditor from "./chat_components/collab/WhiteboardEditor";
import VersionHistoryPanel from "./chat_components/collab/VersionHistoryPanel";
import { isImageMimeType, formatFileSize } from "./chat_components/AttachmentImagePreview";
import type { MessageAttachment, Message, Server, User, ImageDecryptContext } from "./chat_components/types";
import { useWebRTC, type CallState } from "../../../utils/useWebRTC";
import Markdown from "react-native-markdown-display";
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
  createServerDocument,
  createConversationDocument,
  fetchServerDocuments,
  fetchConversationDocuments,
  fetchDocument,
  updateDocument,
  deleteDocument,
  saveDocumentVersion,
  fetchDocumentVersions,
  fetchDocumentVersion,
  summarizeMessage,
  toggleReaction,
  ConversationData,
  DirectMessageData,
  AttachmentData,
  CollabDocumentData,
  DocumentVersionData,
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
import { usePreferences } from "../../../utils/PreferencesContext";

const markdownStyles = {
  body: { color: "#D1D5DB", fontSize: 14, lineHeight: 22 },
  heading1: { color: "#E5E7EB", fontSize: 20, fontWeight: "700" as const, marginBottom: 6, marginTop: 8 },
  heading2: { color: "#E5E7EB", fontSize: 17, fontWeight: "700" as const, marginBottom: 4, marginTop: 6 },
  heading3: { color: "#E5E7EB", fontSize: 15, fontWeight: "600" as const, marginBottom: 4, marginTop: 4 },
  strong: { color: "#F3F4F6", fontWeight: "700" as const },
  em: { color: "#D1D5DB", fontStyle: "italic" as const },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: { backgroundColor: "#2D2E3F", color: "#A78BFA", paddingHorizontal: 4, borderRadius: 3, fontSize: 13 },
  code_block: { backgroundColor: "#2D2E3F", color: "#D1D5DB", padding: 8, borderRadius: 6, fontSize: 13 },
  fence: { backgroundColor: "#2D2E3F", color: "#D1D5DB", padding: 8, borderRadius: 6, fontSize: 13 },
  blockquote: { backgroundColor: "#1E1F2E", borderLeftColor: "#A78BFA", borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4, marginVertical: 4 },
  hr: { backgroundColor: "#374151", height: 1, marginVertical: 8 },
  paragraph: { marginVertical: 2 },
};

const ChatPage: React.FC = () => {
  const router = useRouter();
  const { token, username, userId, logout, refreshAccessToken, isLoading: authLoading } = useAuth();
  const { fontSizeValue, fontFamily } = usePreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const chatInputRef = useRef<any>(null);

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

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{ id: number; username: string; content: string } | null>(null);

  // Reaction state
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<number | null>(null);

  // Slowmode state
  const [slowmodeCooldown, setSlowmodeCooldown] = useState(0);
  const slowmodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI Summary state
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryThinking, setSummaryThinking] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

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
  // Ref for retryPendingDecryptions — populated after function is defined
  const retryPendingDecryptionsRef = useRef<(() => void) | null>(null);

  // ─── Call State ─────────────────────────────────────────────────
  const [callMinimized, setCallMinimized] = useState(false);
  // Ref for WebRTC signaling handler — set after useWebRTC hook is created
  const handleCallSignalingRef = useRef<((msg: any) => void) | null>(null);

  // ─── Permission State ──────────────────────────────────────────
  const [channelPermissionDenied, setChannelPermissionDenied] = useState(false);
  const [canSendMessages, setCanSendMessages] = useState(true);

  // ─── Collaborative Documents State ────────────────────────────
  const [showDocPanel, setShowDocPanel] = useState(false);
  const [collabDocuments, setCollabDocuments] = useState<CollabDocumentData[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<CollabDocumentData | null>(null);
  const [selectedDocVersion, setSelectedDocVersion] = useState<DocumentVersionData | null>(null);
  const [docVersions, setDocVersions] = useState<DocumentVersionData[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  // Ref for selectedDocument to avoid stale closures in WS callbacks
  const selectedDocumentRef = useRef<CollabDocumentData | null>(null);
  selectedDocumentRef.current = selectedDocument;
  // Remote editing state — passed to editors as props
  const [remoteDocContent, setRemoteDocContent] = useState<string | undefined>(undefined);
  const [remoteDocContentVersion, setRemoteDocContentVersion] = useState(0);
  const [remoteWbAction, setRemoteWbAction] = useState<any>(undefined);
  const [remoteWbActionVersion, setRemoteWbActionVersion] = useState(0);

  // Refs for document WS callbacks (avoids "used before declaration" errors)
  const handleWsDocCreatedRef = useRef<((doc: any) => void) | null>(null);
  const handleWsDocDeletedRef = useRef<((docId: number) => void) | null>(null);
  const handleWsDocRenamedRef = useRef<((docId: number, title: string) => void) | null>(null);
  const handleWsDocEditRef = useRef<((docId: number, content: string, userId: number) => void) | null>(null);
  const handleWsWhiteboardActionRef = useRef<((docId: number, action: any, userId: number) => void) | null>(null);
  const handleDmWsDocCreatedRef = useRef<((doc: any, convId: number) => void) | null>(null);
  const handleDmWsDocDeletedRef = useRef<((docId: number, convId: number) => void) | null>(null);
  const handleDmWsDocRenamedRef = useRef<((docId: number, title: string, convId: number) => void) | null>(null);
  const handleDmWsDocEditRef = useRef<((docId: number, content: string, convId: number, userId: number) => void) | null>(null);
  const handleDmWsWhiteboardActionRef = useRef<((docId: number, action: any, convId: number, userId: number) => void) | null>(null);

  // Refs for undo/redo/cursor WS callbacks
  const handleWsWhiteboardUndoRef = useRef<((docId: number, userId: number) => void) | null>(null);
  const handleWsWhiteboardRedoRef = useRef<((docId: number, userId: number) => void) | null>(null);
  const handleWsCursorUpdateRef = useRef<((docId: number, cursorType: string, position: any, userId: number, username: string) => void) | null>(null);
  const handleDmWsWhiteboardUndoRef = useRef<((docId: number, convId: number, userId: number) => void) | null>(null);
  const handleDmWsWhiteboardRedoRef = useRef<((docId: number, convId: number, userId: number) => void) | null>(null);
  const handleDmWsCursorUpdateRef = useRef<((docId: number, cursorType: string, position: any, convId: number, userId: number, username: string) => void) | null>(null);

  // Remote undo/redo version counters
  const [remoteWbUndo, setRemoteWbUndo] = useState(0);
  const [remoteWbRedo, setRemoteWbRedo] = useState(0);

  // Remote cursors state: { [userId]: { userId, username, x?, y?, offset?, documentId } }
  const [remoteCursors, setRemoteCursors] = useState<Record<number, { userId: number; username: string; x?: number; y?: number; offset?: number; documentId: number }>>({});
  const cursorCleanupTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

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
    let encryptionRetryFields: Partial<Message> = {};
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
                // Key just became available — retry any pending decryptions
                retryPendingDecryptionsRef.current?.();
              }
            }
          }
        } catch {
          // Key still not available
        }
      }
      if (serverKeyBytes) {
        const plaintext = decryptServerMessage(message.content, message.nonce, serverKeyBytes);
        if (plaintext) {
          decryptedContent = plaintext;
        } else {
          // Decryption returned null — store raw data for retry
          decryptedContent = "[Could not decrypt]";
          encryptionRetryFields = {
            _encrypted: true,
            _rawContent: message.content,
            _rawNonce: message.nonce,
          };
        }
      } else {
        // No key available — store raw data for retry when key arrives
        decryptedContent = "[Encrypted]";
        encryptionRetryFields = {
          _encrypted: true,
          _rawContent: message.content,
          _rawNonce: message.nonce,
        };
      }
    }
    const decryptedMsg: Message = { ...message, content: decryptedContent, ...encryptionRetryFields };
    setMessages((prev) => {
      if (prev.some(m => m.id === decryptedMsg.id)) return prev;
      return [...prev, decryptedMsg];
    });
  }, []);

  const handleWsMessageEdited = useCallback(async (messageId: number, content: string, isEncrypted?: boolean, nonce?: string) => {
    let decryptedContent = content;
    let retryFields: Partial<Message> = {};
    if (isEncrypted && nonce) {
      const currentServer = selectedServerRef.current;
      if (currentServer) {
        const serverKeyBytes = await getServerKey(currentServer.id);
        if (serverKeyBytes) {
          const plaintext = decryptServerMessage(content, nonce, serverKeyBytes);
          if (plaintext) {
            decryptedContent = plaintext;
            retryFields = { _encrypted: false, _rawContent: undefined, _rawNonce: undefined };
          } else {
            decryptedContent = "[Could not decrypt]";
            retryFields = { _encrypted: true, _rawContent: content, _rawNonce: nonce };
          }
        } else {
          decryptedContent = "[Encrypted]";
          retryFields = { _encrypted: true, _rawContent: content, _rawNonce: nonce };
        }
      }
    } else {
      // Not encrypted or no nonce — clear retry fields
      retryFields = { _encrypted: false, _rawContent: undefined, _rawNonce: undefined };
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: decryptedContent, ...retryFields } : m))
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
      // Decrypt server messages using the cached key, storing raw data for retry on failure
      let serverKeyBytes = await getServerKey(selectedServer.id);
      const decryptedData = data.map((m: any) => {
        let content = m.content;
        let retryFields: Partial<Message> = {};
        if (m.is_encrypted && m.nonce && serverKeyBytes) {
          const plaintext = decryptServerMessage(m.content, m.nonce, serverKeyBytes);
          if (plaintext) {
            content = plaintext;
          } else {
            content = "[Could not decrypt]";
            retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce };
          }
        } else if (m.is_encrypted) {
          content = "[Encrypted]";
          retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce };
        }
        return { ...m, content, ...retryFields };
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
              let retryFields: Partial<Message> = {};
              if (m.is_encrypted && m.nonce && serverKeyBytes) {
                const plaintext = decryptServerMessage(m.content, m.nonce, serverKeyBytes);
                if (plaintext) {
                  content = plaintext;
                } else {
                  content = "[Could not decrypt]";
                  retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce };
                }
              } else if (m.is_encrypted) {
                content = "[Encrypted]";
                retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce };
              }
              return { ...m, content, ...retryFields };
            });
            setMessages((prev) => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMsgs = decryptedMissed.filter((m: any) => !existingIds.has(m.id));
              return [...prev, ...newMsgs];
            });
          }
          // After reconnection sync, retry any previously pending decryptions
          // (key may have become available while disconnected)
          retryPendingDecryptionsRef.current?.();
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
              // Retry any pending decryptions with the new key, then reload remaining
              retryPendingDecryptionsRef.current?.();
              loadMessagesRef.current?.();
            }
          }
        }
      } catch {
        // Key not available yet
      }
    }
  }, []);

  // ─── Retry Pending Decryptions ──────────────────────────────────
  // Re-attempts decryption on any messages that still have _encrypted === true.
  // Called after a server key becomes available or keys are updated.
  const retryPendingDecryptions = useCallback(async () => {
    const currentServer = selectedServerRef.current;
    const currentConversationId = selectedConversationIdRef.current;

    // Server messages retry
    if (currentServer) {
      const serverKeyBytes = await getServerKey(currentServer.id);
      if (serverKeyBytes) {
        setMessages((prev) => {
          let changed = false;
          const updated = prev.map((m) => {
            if (!m._encrypted || !m._rawContent || !m._rawNonce) return m;
            const plaintext = decryptServerMessage(m._rawContent, m._rawNonce, serverKeyBytes);
            if (plaintext) {
              changed = true;
              return {
                ...m,
                content: plaintext,
                _encrypted: false,
                _rawContent: undefined,
                _rawNonce: undefined,
              };
            }
            return m;
          });
          return changed ? updated : prev;
        });
      }
    }

    // DM messages retry
    if (currentConversationId && myKeyPairRef.current) {
      setDmMessages((prev) => {
        let changed = false;
        const updated = prev.map((m) => {
          if (!m._encrypted || !m._rawContent || !m._rawNonce || !m._senderPublicKey) return m;
          try {
            const senderPubKey = decodeBase64(m._senderPublicKey);
            const plaintext = decryptDmMessage(m._rawContent, m._rawNonce, senderPubKey, myKeyPairRef.current!.secretKey);
            if (plaintext) {
              changed = true;
              return {
                ...m,
                content: plaintext,
                _encrypted: false,
                _rawContent: undefined,
                _rawNonce: undefined,
                _senderPublicKey: undefined,
              };
            }
          } catch {
            // Decryption still failing
          }
          return m;
        });
        return changed ? updated : prev;
      });
    }
  }, []);

  // Keep the ref in sync so WS callbacks can call the latest version
  retryPendingDecryptionsRef.current = retryPendingDecryptions;

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
    sendDocEdit: sendServerDocEdit, sendWhiteboardAction: sendServerWhiteboardAction,
    sendWhiteboardUndo: sendServerWhiteboardUndo, sendWhiteboardRedo: sendServerWhiteboardRedo,
    sendCursorUpdate: sendServerCursorUpdate,
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
    onDocCreated: (doc: any) => handleWsDocCreatedRef.current?.(doc),
    onDocDeleted: (docId: any) => handleWsDocDeletedRef.current?.(docId),
    onDocRenamed: (docId: any, title: any) => handleWsDocRenamedRef.current?.(docId, title),
    onDocEdit: (docId: any, content: any, userId: any) => handleWsDocEditRef.current?.(docId, content, userId),
    onWhiteboardAction: (docId: any, action: any, userId: any) => handleWsWhiteboardActionRef.current?.(docId, action, userId),
    onWhiteboardUndo: (docId: any, userId: any) => handleWsWhiteboardUndoRef.current?.(docId, userId),
    onWhiteboardRedo: (docId: any, userId: any) => handleWsWhiteboardRedoRef.current?.(docId, userId),
    onCursorUpdate: (docId: any, cursorType: any, position: any, userId: any, username: any) => handleWsCursorUpdateRef.current?.(docId, cursorType, position, userId, username),
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
    let dmRetryFields: Partial<Message> = {};
    if (message.is_encrypted && message.nonce) {
      if (message.sender_public_key && myKeyPairRef.current) {
        const senderPubKey = decodeBase64(message.sender_public_key);
        const plaintext = decryptDmMessage(message.content, message.nonce, senderPubKey, myKeyPairRef.current.secretKey);
        if (plaintext) {
          decryptedContent = plaintext;
        } else {
          decryptedContent = "[Could not decrypt]";
          dmRetryFields = {
            _encrypted: true,
            _rawContent: message.content,
            _rawNonce: message.nonce,
            _senderPublicKey: message.sender_public_key,
          };
        }
      } else {
        // sender_public_key missing or keypair not ready — store for retry
        decryptedContent = message.sender_public_key ? "[Encrypted]" : "[Encrypted - missing sender key]";
        dmRetryFields = {
          _encrypted: true,
          _rawContent: message.content,
          _rawNonce: message.nonce,
          _senderPublicKey: message.sender_public_key || undefined,
        };
      }
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
          ...dmRetryFields,
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
    let retryFields: Partial<Message> = {};
    if (isEncrypted && nonce) {
      if (senderPublicKey && myKeyPairRef.current) {
        const senderPubKey = decodeBase64(senderPublicKey);
        const plaintext = decryptDmMessage(content, nonce, senderPubKey, myKeyPairRef.current.secretKey);
        if (plaintext) {
          decryptedContent = plaintext;
          retryFields = { _encrypted: false, _rawContent: undefined, _rawNonce: undefined, _senderPublicKey: undefined };
        } else {
          decryptedContent = "[Could not decrypt]";
          retryFields = { _encrypted: true, _rawContent: content, _rawNonce: nonce, _senderPublicKey: senderPublicKey };
        }
      } else {
        decryptedContent = "[Encrypted]";
        retryFields = { _encrypted: true, _rawContent: content, _rawNonce: nonce, _senderPublicKey: senderPublicKey || undefined };
      }
    } else {
      retryFields = { _encrypted: false, _rawContent: undefined, _rawNonce: undefined, _senderPublicKey: undefined };
    }
    setDmMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: decryptedContent, ...retryFields } : m))
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
    sendDocEdit: sendDmDocEdit,
    sendWhiteboardAction: sendDmWhiteboardAction,
    sendWhiteboardUndo: sendDmWhiteboardUndo,
    sendWhiteboardRedo: sendDmWhiteboardRedo,
    sendCursorUpdate: sendDmCursorUpdate,
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
    onDocCreated: (doc: any, convId: any) => handleDmWsDocCreatedRef.current?.(doc, convId),
    onDocDeleted: (docId: any, convId: any) => handleDmWsDocDeletedRef.current?.(docId, convId),
    onDocRenamed: (docId: any, title: any, convId: any) => handleDmWsDocRenamedRef.current?.(docId, title, convId),
    onDocEdit: (docId: any, content: any, convId: any, userId: any) => handleDmWsDocEditRef.current?.(docId, content, convId, userId),
    onWhiteboardAction: (docId: any, action: any, convId: any, userId: any) => handleDmWsWhiteboardActionRef.current?.(docId, action, convId, userId),
    onWhiteboardUndo: (docId: any, convId: any, userId: any) => handleDmWsWhiteboardUndoRef.current?.(docId, convId, userId),
    onWhiteboardRedo: (docId: any, convId: any, userId: any) => handleDmWsWhiteboardRedoRef.current?.(docId, convId, userId),
    onCursorUpdate: (docId: any, cursorType: any, position: any, convId: any, userId: any, username: any) => handleDmWsCursorUpdateRef.current?.(docId, cursorType, position, convId, userId, username),
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

  // When encryption becomes ready, retry messages that arrived before keypair was available
  useEffect(() => {
    if (encryptionReady && myKeyPairRef.current) {
      retryPendingDecryptionsRef.current?.();
    }
  }, [encryptionReady]);

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
          if (success) {
            redistributeServerKey(server.id);
            // Retry any pending decryptions now that the key is available
            retryPendingDecryptionsRef.current?.();
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

  // ─── Collaborative Document Handlers ───────────────────────────

  const loadDocuments = useCallback(async () => {
    if (!token) return;
    try {
      let docs: CollabDocumentData[];
      if (isDmMode && selectedConversationId) {
        docs = await fetchConversationDocuments(token, selectedConversationId, logout);
      } else if (selectedServer) {
        docs = await fetchServerDocuments(token, selectedServer.id, logout);
      } else {
        return;
      }
      setCollabDocuments(docs);
    } catch {
    }
  }, [token, isDmMode, selectedConversationId, selectedServer, logout]);

  // Load documents when server/conversation changes
  useEffect(() => {
    if (token && (selectedServer || selectedConversationId)) {
      loadDocuments();
    } else {
      setCollabDocuments([]);
    }
    // Close document panel when switching server/conversation
    setSelectedDocument(null);
    setShowDocPanel(false);
    setShowVersionHistory(false);
  }, [selectedServer?.id, selectedConversationId, token]);

  const handleCreateDocument = useCallback(async (title: string, docType: "document" | "whiteboard") => {
    if (!token) return;
    try {
      let doc: CollabDocumentData;
      if (isDmMode && selectedConversationId) {
        doc = await createConversationDocument(token, selectedConversationId, title, docType, logout);
      } else if (selectedServer) {
        doc = await createServerDocument(token, selectedServer.id, title, docType, logout);
      } else {
        return;
      }
      setCollabDocuments(prev => [doc, ...prev]);
      showSnackbarRef.current(`Created "${title}"`);
    } catch {
      showSnackbarRef.current("Failed to create document");
    }
  }, [token, isDmMode, selectedConversationId, selectedServer, logout]);

  // Helper: decrypt a document version's content if encrypted
  const decryptDocVersionContent = useCallback(async (version: DocumentVersionData, doc: CollabDocumentData): Promise<DocumentVersionData> => {
    if (!version.nonce) return version; // Not encrypted
    try {
      if (doc.server_id) {
        // Server document — decrypt with server key
        const serverKeyBytes = await getServerKey(doc.server_id);
        if (serverKeyBytes) {
          const plaintext = decryptServerMessage(version.content, version.nonce, serverKeyBytes);
          if (plaintext) return { ...version, content: plaintext };
        }
      } 
    } catch {
      // Decryption failed — return raw content
    }
    return version;
  }, []);

  const handleSelectDocument = useCallback(async (doc: CollabDocumentData) => {
    setSelectedDocument(doc);
    setShowVersionHistory(false);
    setSelectedDocVersion(null);
    setRemoteCursors({}); // Clear remote cursors when switching documents
    // Load latest version
    if (!token) return;
    try {
      const versions = await fetchDocumentVersions(token, doc.id, logout);
      setDocVersions(versions);
      if (versions.length > 0) {
        // Get latest version content and decrypt if needed
        const latest = await fetchDocumentVersion(token, doc.id, versions[0].id, logout);
        const decrypted = await decryptDocVersionContent(latest, doc);
        setSelectedDocVersion(decrypted);
      } else {
        setSelectedDocVersion(null);
      }
    } catch {
      setDocVersions([]);
      setSelectedDocVersion(null);
    }
  }, [token, logout, decryptDocVersionContent]);

  const handleDeleteDocument = useCallback(async (docId: number) => {
    if (!token) return;
    try {
      await deleteDocument(token, docId, logout);
      setCollabDocuments(prev => prev.filter(d => d.id !== docId));
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
        setSelectedDocVersion(null);
        setDocVersions([]);
        setShowVersionHistory(false);
      }
      showSnackbarRef.current("Document deleted");
    } catch {
      showSnackbarRef.current("Failed to delete document");
    }
  }, [token, selectedDocument, logout]);

  const handleRenameDocument = useCallback(async (docId: number, newTitle: string) => {
    if (!token) return;
    try {
      const updated = await updateDocument(token, docId, newTitle, logout);
      setCollabDocuments(prev => prev.map(d => d.id === docId ? { ...d, title: updated.title } : d));
      if (selectedDocument?.id === docId) {
        setSelectedDocument(prev => prev ? { ...prev, title: updated.title } : prev);
      }
    } catch {
      showSnackbarRef.current("Failed to rename document");
    }
  }, [token, selectedDocument, logout]);

  const handleSaveDocumentContent = useCallback(async (content: string) => {
    if (!token || !selectedDocument) return;
    setIsSavingDoc(true);
    try {
      let contentToSave = content;
      let nonceToSave: string | null = null;

      // Encrypt if document is in a server with an available key
      if (selectedDocument.server_id) {
        const serverKeyBytes = await getServerKey(selectedDocument.server_id);
        if (serverKeyBytes) {
          const encrypted = encryptServerMessage(content, serverKeyBytes);
          if (encrypted) {
            contentToSave = encrypted.ciphertext;
            nonceToSave = encrypted.nonce;
          }
        }
      }

      const newVersion = await saveDocumentVersion(token, selectedDocument.id, contentToSave, nonceToSave, logout);
      // Store the decrypted content in local state so the editor shows plaintext
      setDocVersions(prev => [newVersion, ...prev]);
      setSelectedDocVersion({ ...newVersion, content });
      showSnackbarRef.current("Version saved");
    } catch {
      showSnackbarRef.current("Failed to save version");
    } finally {
      setIsSavingDoc(false);
    }
  }, [token, selectedDocument, logout]);

  const handleShowVersionHistory = useCallback(async () => {
    if (!token || !selectedDocument) return;
    try {
      const versions = await fetchDocumentVersions(token, selectedDocument.id, logout);
      setDocVersions(versions);
      setShowVersionHistory(true);
    } catch {
      showSnackbarRef.current("Failed to load versions");
    }
  }, [token, selectedDocument, logout]);

  const handleSelectVersion = useCallback(async (version: DocumentVersionData) => {
    if (!token || !selectedDocument) return;
    try {
      const fullVersion = await fetchDocumentVersion(token, selectedDocument.id, version.id, logout);
      const decrypted = await decryptDocVersionContent(fullVersion, selectedDocument);
      setSelectedDocVersion(decrypted);
    } catch {
      showSnackbarRef.current("Failed to load version");
    }
  }, [token, selectedDocument, logout, decryptDocVersionContent]);

  const handleRestoreVersion = useCallback(async (version: DocumentVersionData) => {
    if (!token || !selectedDocument) return;
    try {
      // Load the version content, decrypt it, then re-encrypt as a new version
      const fullVersion = await fetchDocumentVersion(token, selectedDocument.id, version.id, logout);
      const decrypted = await decryptDocVersionContent(fullVersion, selectedDocument);

      // Re-encrypt the decrypted content for the new version
      let contentToSave = decrypted.content;
      let nonceToSave: string | null = null;
      if (selectedDocument.server_id) {
        const serverKeyBytes = await getServerKey(selectedDocument.server_id);
        if (serverKeyBytes) {
          const encrypted = encryptServerMessage(decrypted.content, serverKeyBytes);
          if (encrypted) {
            contentToSave = encrypted.ciphertext;
            nonceToSave = encrypted.nonce;
          }
        }
      }

      const newVersion = await saveDocumentVersion(token, selectedDocument.id, contentToSave, nonceToSave, logout);
      setDocVersions(prev => [newVersion, ...prev]);
      setSelectedDocVersion({ ...newVersion, content: decrypted.content });
      setShowVersionHistory(false);
      showSnackbarRef.current(`Restored version ${version.version_number}`);
    } catch {
      showSnackbarRef.current("Failed to restore version");
    }
  }, [token, selectedDocument, logout, decryptDocVersionContent]);

  const handleToggleDocPanel = useCallback(() => {
    setShowDocPanel(prev => {
      if (!prev) {
        // Opening panel — load documents
        loadDocuments();
      }
      return !prev;
    });
    // Close document editor if closing the panel
    if (showDocPanel) {
      setSelectedDocument(null);
      setShowVersionHistory(false);
    }
  }, [showDocPanel, loadDocuments]);

  const handleCloseDocumentEditor = useCallback(() => {
    setSelectedDocument(null);
    setSelectedDocVersion(null);
    setDocVersions([]);
    setShowVersionHistory(false);
    setRemoteCursors({});
  }, []);

  // ─── Document WebSocket Callbacks ──────────────────────────────

  const handleWsDocCreated = useCallback((document: CollabDocumentData) => {
    setCollabDocuments(prev => {
      if (prev.some(d => d.id === document.id)) return prev;
      return [document, ...prev];
    });
  }, []);

  const handleWsDocDeleted = useCallback((documentId: number) => {
    setCollabDocuments(prev => prev.filter(d => d.id !== documentId));
    if (selectedDocumentRef.current?.id === documentId) {
      setSelectedDocument(null);
      setSelectedDocVersion(null);
      setDocVersions([]);
      setShowVersionHistory(false);
    }
  }, []);

  const handleWsDocRenamed = useCallback((documentId: number, title: string) => {
    setCollabDocuments(prev => prev.map(d => d.id === documentId ? { ...d, title } : d));
    if (selectedDocumentRef.current?.id === documentId) {
      setSelectedDocument(prev => prev ? { ...prev, title } : prev);
    }
  }, []);

  const handleWsDocEdit = useCallback((documentId: number, content: string, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteDocContent(content);
      setRemoteDocContentVersion(v => v + 1);
    }
  }, [userId]);

  const handleWsWhiteboardAction = useCallback((documentId: number, action: any, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbAction(action);
      setRemoteWbActionVersion(v => v + 1);
    }
  }, [userId]);

  // DM document callbacks (include conversationId check)
  const handleDmWsDocCreated = useCallback((document: CollabDocumentData, conversationId: number) => {
    if (selectedConversationIdRef.current === conversationId) {
      setCollabDocuments(prev => {
        if (prev.some(d => d.id === document.id)) return prev;
        return [document, ...prev];
      });
    }
  }, []);

  const handleDmWsDocDeleted = useCallback((documentId: number, conversationId: number) => {
    if (selectedConversationIdRef.current === conversationId) {
      setCollabDocuments(prev => prev.filter(d => d.id !== documentId));
    }
    if (selectedDocumentRef.current?.id === documentId) {
      setSelectedDocument(null);
      setSelectedDocVersion(null);
      setDocVersions([]);
      setShowVersionHistory(false);
    }
  }, []);

  const handleDmWsDocRenamed = useCallback((documentId: number, title: string, conversationId: number) => {
    if (selectedConversationIdRef.current === conversationId) {
      setCollabDocuments(prev => prev.map(d => d.id === documentId ? { ...d, title } : d));
    }
    if (selectedDocumentRef.current?.id === documentId) {
      setSelectedDocument(prev => prev ? { ...prev, title } : prev);
    }
  }, []);

  const handleDmWsDocEdit = useCallback((documentId: number, content: string, conversationId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteDocContent(content);
      setRemoteDocContentVersion(v => v + 1);
    }
  }, [userId]);

  const handleDmWsWhiteboardAction = useCallback((documentId: number, action: any, conversationId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbAction(action);
      setRemoteWbActionVersion(v => v + 1);
    }
  }, [userId]);

  // ─── Undo/Redo WS callbacks ────────────────────────────────────
  const handleWsWhiteboardUndo = useCallback((documentId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbUndo(v => v + 1);
    }
  }, [userId]);

  const handleWsWhiteboardRedo = useCallback((documentId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbRedo(v => v + 1);
    }
  }, [userId]);

  const handleDmWsWhiteboardUndo = useCallback((documentId: number, conversationId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbUndo(v => v + 1);
    }
  }, [userId]);

  const handleDmWsWhiteboardRedo = useCallback((documentId: number, conversationId: number, remoteUserId: number) => {
    if (selectedDocumentRef.current?.id === documentId && remoteUserId !== userId) {
      setRemoteWbRedo(v => v + 1);
    }
  }, [userId]);

  // ─── Cursor Update WS callbacks ────────────────────────────────
  const updateRemoteCursor = useCallback((documentId: number, cursorType: string, position: any, remoteUserId: number, remoteUsername: string) => {
    if (selectedDocumentRef.current?.id !== documentId) return;
    setRemoteCursors(prev => ({
      ...prev,
      [remoteUserId]: {
        userId: remoteUserId,
        username: remoteUsername,
        ...(cursorType === "whiteboard" ? { x: position.x, y: position.y } : { offset: position.offset }),
        documentId,
      },
    }));
    // Reset stale cursor cleanup timer for this user
    if (cursorCleanupTimersRef.current[remoteUserId]) {
      clearTimeout(cursorCleanupTimersRef.current[remoteUserId]);
    }
    cursorCleanupTimersRef.current[remoteUserId] = setTimeout(() => {
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[remoteUserId];
        return next;
      });
    }, 5000);
  }, []);

  const handleWsCursorUpdate = useCallback((documentId: number, cursorType: string, position: any, remoteUserId: number, remoteUsername: string) => {
    if (remoteUserId === userId) return;
    updateRemoteCursor(documentId, cursorType, position, remoteUserId, remoteUsername);
  }, [userId, updateRemoteCursor]);

  const handleDmWsCursorUpdate = useCallback((documentId: number, cursorType: string, position: any, conversationId: number, remoteUserId: number, remoteUsername: string) => {
    if (remoteUserId === userId) return;
    updateRemoteCursor(documentId, cursorType, position, remoteUserId, remoteUsername);
  }, [userId, updateRemoteCursor]);

  // Sync callback refs so the WS hooks (declared earlier) can call the latest handlers
  handleWsDocCreatedRef.current = handleWsDocCreated;
  handleWsDocDeletedRef.current = handleWsDocDeleted;
  handleWsDocRenamedRef.current = handleWsDocRenamed;
  handleWsDocEditRef.current = handleWsDocEdit;
  handleWsWhiteboardActionRef.current = handleWsWhiteboardAction;
  handleWsWhiteboardUndoRef.current = handleWsWhiteboardUndo;
  handleWsWhiteboardRedoRef.current = handleWsWhiteboardRedo;
  handleWsCursorUpdateRef.current = handleWsCursorUpdate;
  handleDmWsDocCreatedRef.current = handleDmWsDocCreated;
  handleDmWsDocDeletedRef.current = handleDmWsDocDeleted;
  handleDmWsDocRenamedRef.current = handleDmWsDocRenamed;
  handleDmWsDocEditRef.current = handleDmWsDocEdit;
  handleDmWsWhiteboardActionRef.current = handleDmWsWhiteboardAction;
  handleDmWsWhiteboardUndoRef.current = handleDmWsWhiteboardUndo;
  handleDmWsWhiteboardRedoRef.current = handleDmWsWhiteboardRedo;
  handleDmWsCursorUpdateRef.current = handleDmWsCursorUpdate;

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
        let retryFields: Partial<Message> = {};
        if (m.is_encrypted && m.nonce) {
          if (m.sender_public_key && myKeyPairRef.current) {
            const senderPubKey = decodeBase64(m.sender_public_key);
            const plaintext = decryptDmMessage(m.content, m.nonce, senderPubKey, myKeyPairRef.current.secretKey);
            if (plaintext) {
              content = plaintext;
            } else {
              content = "[Could not decrypt]";
              retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce, _senderPublicKey: m.sender_public_key };
            }
          } else {
            content = m.sender_public_key ? "[Encrypted]" : "[Encrypted - missing sender key]";
            retryFields = { _encrypted: true, _rawContent: m.content, _rawNonce: m.nonce, _senderPublicKey: m.sender_public_key || undefined };
          }
        }
        return {
          id: m.id,
          username: m.username,
          content,
          user_id: m.user_id,
          timestamp: m.created_at,
          attachment: m.attachment || null,
          ...retryFields,
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
        const blob = new Blob([new Uint8Array(encryptedBytes!)], { type: "application/octet-stream" });
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
            myKeyPairRef.current!.publicKey, mySecretKey
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
        const blob = new Blob([new Uint8Array(decryptedBytes)], { type: mimeType });
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
    // Slowmode check for server messages
    if (!isDmMode && slowmodeCooldown > 0) {
      setError(`Slow mode active – wait ${slowmodeCooldown}s`);
      return;
    }
    setError(null);
    const currentReplyId = replyingTo?.id;
    setReplyingTo(null);

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
        reply_to: replyingTo ? { id: replyingTo.id, content: replyingTo.content, username: replyingTo.username, user_id: 0 } : undefined,
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
                const result = await sendDirectMessage(token, selectedConversationId, ciphertext, logout, encryptionParams, currentReplyId);
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
        const result = await sendDirectMessage(token, selectedConversationId, messageContent, logout, undefined, currentReplyId);
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
        reply_to: replyingTo ? { id: replyingTo.id, content: replyingTo.content, username: replyingTo.username, user_id: 0 } : undefined,
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
            const result: any = await sendMessage(token, ciphertext, selectedServer.id, userId!, logout, encryptionParams, currentReplyId);
            if (!isConnected) {
              await loadMessages();
            } else if (result?.message_id) {
              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.message_id } : m));
              sendAck(result.message_id);
            }
            // Start slowmode cooldown
            if (selectedServer && (selectedServer.slow_mode_seconds ?? 0) > 0) {
              startSlowmodeCooldown(selectedServer.slow_mode_seconds!);
            }
            return;
          }
        }
        // Unencrypted fallback
        const result: any = await sendMessage(token, messageContent, selectedServer.id, userId!, logout, undefined, currentReplyId);
        if (!isConnected) {
          await loadMessages();
        } else if (result?.message_id) {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: result.message_id } : m));
          sendAck(result.message_id);
        }
        // Start slowmode cooldown
        if (selectedServer && (selectedServer.slow_mode_seconds ?? 0) > 0) {
          startSlowmodeCooldown(selectedServer.slow_mode_seconds!);
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

  const handleSummarize = async (messageId: number) => {
    setMenuVisible(false);
    const msg = currentMessages.find((m) => m.id === messageId);
    if (!msg || !msg.content || msg.content.startsWith("📎 ")) {
      showSnackbar("No text content to summarize");
      return;
    }
    setSummaryLoading(true);
    setSummaryText("");
    setSummaryThinking("");
    setThinkingExpanded(false);
    setSummaryVisible(true);
    try {
      const result = await summarizeMessage(token!, msg.content, msg.id, isDmMode, logout);
      setSummaryText(result.summary);
      setSummaryThinking(result.thinking || "");
    } catch (e: any) {
      setSummaryText("Failed to generate summary. " + (e?.message || ""));
    } finally {
      setSummaryLoading(false);
    }
  };

  // ─── Reply handler ──────────────────────────────────────────────
  const handleReplyPress = (messageId: number) => {
    const msg = currentMessages.find((m) => m.id === messageId);
    if (msg) {
      setReplyingTo({
        id: msg.id,
        username: msg.username,
        content: msg.content,
      });
      setMenuVisible(false);
      chatInputRef.current?.focus?.();
    }
  };

  const cancelReply = () => setReplyingTo(null);

  // ─── Reaction handlers ────────────────────────────────────────
  const handleReactionToggle = async (messageId: number, emoji: string) => {
    if (!token) return;
    try {
      const result: any = await toggleReaction(token, messageId, emoji, isDmMode, selectedConversationId, logout);
      // Update local message state with new reactions
      const setFn = isDmMode ? setDmMessages : setMessages;
      setFn((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: result.reactions } : m))
      );
    } catch (e: any) {
      showSnackbar("Failed to react: " + (e?.message || ""));
    }
  };

  const handleReactPress = (messageId: number) => {
    setEmojiPickerMessageId(messageId);
    setEmojiPickerVisible(true);
  };

  const handleEmojiSelect = (emoji: string) => {
    if (emojiPickerMessageId !== null) {
      handleReactionToggle(emojiPickerMessageId, emoji);
    }
    setEmojiPickerVisible(false);
    setEmojiPickerMessageId(null);
  };

  // ─── Slowmode cooldown ────────────────────────────────────────
  const startSlowmodeCooldown = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    setSlowmodeCooldown(seconds);
    if (slowmodeTimerRef.current) clearInterval(slowmodeTimerRef.current);
    slowmodeTimerRef.current = setInterval(() => {
      setSlowmodeCooldown((prev) => {
        if (prev <= 1) {
          if (slowmodeTimerRef.current) clearInterval(slowmodeTimerRef.current);
          slowmodeTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

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
      fontSizeValue={fontSizeValue}
      fontFamily={fontFamily}
      onReplyPress={handleReplyPress}
      onReactionToggle={handleReactionToggle}
      onReactPress={handleReactPress}
      currentUserId={userId ?? undefined}
    />
  );

  // Keyboard navigation (web only)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close modals in priority order
        if (menuVisible) { setMenuVisible(false); return; }
        if (isUserDialogOpen) { setIsUserDialogOpen(false); return; }
        if (isServerSettingsOpen) { setIsServerSettingsOpen(false); return; }
        if (friendsListOpen) { setFriendsListOpen(false); return; }
        if (selectedDocument) { setSelectedDocument(null); return; }
        if (showDocPanel) { setShowDocPanel(false); return; }
        if (showServerSidebar) { setShowServerSidebar(false); return; }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const active = window.document.activeElement;
        const tag = active?.tagName?.toLowerCase();
        // Only focus input if we're not already in a text field
        if (tag !== "input" && tag !== "textarea" && !(active as HTMLElement)?.isContentEditable) {
          e.preventDefault();
          chatInputRef.current?.focus?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuVisible, isUserDialogOpen, isServerSettingsOpen, friendsListOpen, selectedDocument, showDocPanel, showServerSidebar]);

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
      <YStack flex={1} backgroundColor="#171823" paddingTop={insets.top}>
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
                  backgroundColor="#171823"
                  paddingTop={insets.top}
                >
                  <XStack
                    padding="$4"
                    justifyContent="space-between"
                    alignItems="center"
                    borderBottomWidth={1}
                    borderBottomColor="#2D2E3F"
                  >
                    <Text fontSize="$6" fontWeight="700" color="white">
                      Messages
                    </Text>
                    <TouchableOpacity onPress={() => setShowServerSidebar(false)}>
                      <CloseIcon size={24} color="#9CA3AF" />
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
            <YStack flex={1} backgroundColor="#1E1F2B">
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
                onToggleDocuments={handleToggleDocPanel}
                documentCount={collabDocuments.length}
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

              {/* Main content area: Chat + Document panels */}
              <XStack flex={1}>
                {/* Document List Panel (side panel) */}
                {showDocPanel && !selectedDocument && (
                  <DocumentListPanel
                    documents={collabDocuments}
                    onCreateDocument={handleCreateDocument}
                    onSelectDocument={handleSelectDocument}
                    onDeleteDocument={handleDeleteDocument}
                    onRenameDocument={handleRenameDocument}
                    onClose={() => setShowDocPanel(false)}
                    selectedDocId={null}
                    isMobile={isMobile}
                  />
                )}

                {/* Document/Whiteboard Editor (replaces chat when open) */}
                {selectedDocument ? (
                  <XStack flex={1}>
                    {/* Version History Panel */}
                    {showVersionHistory && (
                      <VersionHistoryPanel
                        versions={docVersions}
                        onSelectVersion={handleSelectVersion}
                        onRestoreVersion={handleRestoreVersion}
                        onClose={() => setShowVersionHistory(false)}
                        currentVersionId={selectedDocVersion?.id}
                      />
                    )}
                    {/* Editor */}
                    {selectedDocument.doc_type === "whiteboard" ? (
                      <WhiteboardEditor
                        document={selectedDocument}
                        latestVersion={selectedDocVersion}
                        onSave={handleSaveDocumentContent}
                        onClose={handleCloseDocumentEditor}
                        isMobile={isMobile}
                        isSaving={isSavingDoc}
                        onShowVersions={handleShowVersionHistory}
                        onActionBroadcast={(action) => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmWhiteboardAction(selectedConversationId, selectedDocument.id, action);
                          } else if (selectedDocument) {
                            sendServerWhiteboardAction(selectedDocument.id, action);
                          }
                        }}
                        remoteAction={remoteWbAction}
                        remoteActionVersion={remoteWbActionVersion}
                        onUndoBroadcast={() => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmWhiteboardUndo(selectedConversationId, selectedDocument.id);
                          } else if (selectedDocument) {
                            sendServerWhiteboardUndo(selectedDocument.id);
                          }
                        }}
                        onRedoBroadcast={() => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmWhiteboardRedo(selectedConversationId, selectedDocument.id);
                          } else if (selectedDocument) {
                            sendServerWhiteboardRedo(selectedDocument.id);
                          }
                        }}
                        remoteUndo={remoteWbUndo}
                        remoteRedo={remoteWbRedo}
                        onCursorBroadcast={(position) => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmCursorUpdate(selectedConversationId, selectedDocument.id, "whiteboard", position);
                          } else if (selectedDocument) {
                            sendServerCursorUpdate(selectedDocument.id, "whiteboard", position);
                          }
                        }}
                        remoteCursors={selectedDocument ? Object.values(remoteCursors).filter(c => c.documentId === selectedDocument.id && c.x !== undefined).map(c => ({ userId: c.userId, username: c.username, x: c.x!, y: c.y! })) : []}
                      />
                    ) : (
                      <DocumentEditor
                        document={selectedDocument}
                        latestVersion={selectedDocVersion}
                        onSave={handleSaveDocumentContent}
                        onClose={handleCloseDocumentEditor}
                        isMobile={isMobile}
                        isSaving={isSavingDoc}
                        onShowVersions={handleShowVersionHistory}
                        onContentBroadcast={(content) => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmDocEdit(selectedConversationId, selectedDocument.id, content);
                          } else if (selectedDocument) {
                            sendServerDocEdit(selectedDocument.id, content);
                          }
                        }}
                        remoteContent={remoteDocContent}
                        remoteContentVersion={remoteDocContentVersion}
                        onCursorBroadcast={(offset) => {
                          if (isDmMode && selectedConversationId && selectedDocument) {
                            sendDmCursorUpdate(selectedConversationId, selectedDocument.id, "document", { offset });
                          } else if (selectedDocument) {
                            sendServerCursorUpdate(selectedDocument.id, "document", { offset });
                          }
                        }}
                        remoteCursors={selectedDocument ? Object.values(remoteCursors).filter(c => c.documentId === selectedDocument.id && c.offset !== undefined).map(c => ({ userId: c.userId, username: c.username, offset: c.offset! })) : []}
                      />
                    )}
                  </XStack>
                ) : (
                  /* Regular chat view */
                  <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === "ios" ? (isMobile ? 90 : 100) : 0}
                  >
                    <YStack flex={1} backgroundColor="#1E1F2B">
                      {error && !channelPermissionDenied && (
                        <Card
                          backgroundColor="#EF4444"
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
                            borderColor="#F59E0B"
                            borderRadius="$4"
                            padding="$4"
                            maxWidth={400}
                            alignItems="center"
                            gap="$2"
                          >
                            <Text color="#F59E0B" fontWeight="700" fontSize="$5" textAlign="center">
                              Permission Denied
                            </Text>
                            <Text color="#FBBF24" fontSize="$3" textAlign="center">
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

                    {/* Reply preview bar */}
                    {replyingTo && (
                      <XStack
                        backgroundColor="#1E1F2B"
                        borderLeftWidth={3}
                        borderLeftColor="#0EA5E9"
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <YStack flex={1}>
                          <Text color="#0EA5E9" fontSize={12} fontWeight="700">
                            Replying to {replyingTo.username}
                          </Text>
                          <Text color="#6B7280" fontSize={12} numberOfLines={1}>
                            {replyingTo.content.length > 60
                              ? replyingTo.content.slice(0, 60) + "..."
                              : replyingTo.content}
                          </Text>
                        </YStack>
                        <TouchableOpacity onPress={cancelReply} style={{ padding: 4 }}>
                          <Text color="#9CA3AF" fontSize={16} fontWeight="700">✕</Text>
                        </TouchableOpacity>
                      </XStack>
                    )}

                    {/* Slowmode cooldown indicator */}
                    {!isDmMode && slowmodeCooldown > 0 && (
                      <XStack
                        backgroundColor="#2D2E3F"
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        alignItems="center"
                        justifyContent="center"
                        gap="$2"
                      >
                        <Text color="#EF4444" fontSize={12} fontWeight="600">
                          ⏱ Slow mode: {slowmodeCooldown}s remaining
                        </Text>
                      </XStack>
                    )}

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
                      fontSizeValue={fontSizeValue}
                      fontFamily={fontFamily}
                      inputRef={chatInputRef}
                    />
                  </KeyboardAvoidingView>
                )}
              </XStack>
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
          onSummarize={() => menuMessageId && handleSummarize(menuMessageId)}
          onReply={() => menuMessageId && handleReplyPress(menuMessageId)}
          onReact={() => {
            if (menuMessageId) {
              setMenuVisible(false);
              handleReactPress(menuMessageId);
            }
          }}
        />

        {/* Emoji Picker Modal */}
        <EmojiPicker
          visible={emojiPickerVisible}
          onClose={() => {
            setEmojiPickerVisible(false);
            setEmojiPickerMessageId(null);
          }}
          onSelect={handleEmojiSelect}
          usedEmojis={
            emojiPickerMessageId
              ? (currentMessages.find(m => m.id === emojiPickerMessageId)?.reactions ?? [])
                  .filter(r => r.users.some(u => u.user_id === userId))
                  .map(r => r.emoji)
              : []
          }
        />

        {/* AI Summary Modal */}
        <Modal
          visible={summaryVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSummaryVisible(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
            onPress={() => setSummaryVisible(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Card
                backgroundColor="#171823"
                padding="$4"
                borderRadius="$4"
                width={isMobile ? 320 : 440}
                maxWidth={500}
              >
                <YStack gap="$3">
                  <XStack alignItems="center" gap="$2">
                    <Sparkles size={20} color="#A78BFA" />
                    <Text color="#A78BFA" fontWeight="700" fontSize="$5">AI Summary</Text>
                  </XStack>

                  {summaryLoading ? (
                    <YStack alignItems="center" gap="$3" paddingVertical="$4">
                      <ActivityIndicator size="large" color="#A78BFA" />
                      <Text color="#9CA3AF" fontSize="$3">Generating summary...</Text>
                    </YStack>
                  ) : (
                    <YStack gap="$3">
                      {/* Thinking Accordion */}
                      {summaryThinking ? (
                        <YStack>
                          <TouchableOpacity onPress={() => setThinkingExpanded(!thinkingExpanded)}>
                            <XStack
                              alignItems="center"
                              gap="$2"
                              paddingVertical="$2"
                              paddingHorizontal="$2"
                              backgroundColor="#1E1F2E"
                              borderRadius="$2"
                            >
                              {thinkingExpanded ? (
                                <ChevronDown size={16} color="#6B7280" />
                              ) : (
                                <ChevronRight size={16} color="#6B7280" />
                              )}
                              <Text color="#6B7280" fontSize="$2" fontWeight="600">
                                AI Thinking Process
                              </Text>
                            </XStack>
                          </TouchableOpacity>
                          {thinkingExpanded && (
                            <YStack
                              backgroundColor="#1E1F2E"
                              borderRadius="$2"
                              padding="$3"
                              marginTop="$1"
                              maxHeight={200}
                            >
                              <ScrollView>
                                <Text color="#9CA3AF" fontSize="$2" lineHeight={18} fontStyle="italic">
                                  {summaryThinking}
                                </Text>
                              </ScrollView>
                            </YStack>
                          )}
                        </YStack>
                      ) : null}

                      {/* Summary Text */}
                      <YStack maxHeight={200}>
                        <ScrollView>
                          <Markdown style={markdownStyles}>
                            {summaryText}
                          </Markdown>
                        </ScrollView>
                      </YStack>
                    </YStack>
                  )}

                  <XStack justifyContent="flex-end">
                    <TouchableOpacity onPress={() => setSummaryVisible(false)}>
                      <Text color="#0EA5E9" fontWeight="600" fontSize="$3">Close</Text>
                    </TouchableOpacity>
                  </XStack>
                </YStack>
              </Card>
            </Pressable>
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
            backgroundColor="#1E1F2B"
            borderWidth={1}
            borderColor="#0EA5E9"
            padding="$3"
            borderRadius="$4"
            shadowColor="black"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.3}
            shadowRadius={8}
          >
            <Text color="#9CA3AF" fontSize="$3">Call ended</Text>
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
