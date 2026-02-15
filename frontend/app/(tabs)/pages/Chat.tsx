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
  ConversationData,
  DirectMessageData,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { useWebSocket } from "../utils/useWebSocket";
import { useDmWebSocket } from "../utils/useDmWebSocket";

const API_URL = "http://localhost:8000/api";

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
  const { token, username, userId, logout, refreshAccessToken } = useAuth();
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

  // Mobile sidebar states
  const [showServerSidebar, setShowServerSidebar] = useState(false);
  const [showUserSidebar, setShowUserSidebar] = useState(false);

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
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [dmTypingUsers, setDmTypingUsers] = useState<Map<number, string>>(new Map());
  const dmTypingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const lastDmMessageIdRef = useRef<number | null>(null);
  const dmTypingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine which mode we're in
  const isDmMode = selectedConversationId !== null && selectedServer === null;

  // Get the active conversation data
  const activeConversation = conversations.find(c => c.id === selectedConversationId);

  const getConversationDisplayName = (convo: ConversationData): string => {
    if (convo.name) return convo.name;
    const other = convo.members.find(m => m.id !== userId);
    return other?.username || "Unknown";
  };

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
  const handleWsNewMessage = useCallback((message: any) => {
    setMessages((prev) => {
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
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

  const handleWsTyping = useCallback((uid: number, uname: string) => {
    if (uid === userId) return;
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

  const handleWsStopTyping = useCallback((uid: number) => {
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
  const loadMessagesRef = useRef<() => Promise<void>>();
  loadMessagesRef.current = async () => {
    if (!token || !selectedServer) return;
    try {
      const data = await apiRequest<Message[]>(
        `${API_URL}/messages?server_id=${selectedServer.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout,
        refreshAccessToken
      );
      setMessages(data);
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

  const { isConnected, sendTyping, sendStopTyping, sendAck } = useWebSocket({
    serverId: selectedServer?.id ?? null,
    token,
    onNewMessage: handleWsNewMessage,
    onMessageEdited: handleWsMessageEdited,
    onMessageDeleted: handleWsMessageDeleted,
    onTyping: handleWsTyping,
    onStopTyping: handleWsStopTyping,
    onConnectionChange: handleConnectionChange,
  });

  // ─── DM WebSocket callbacks ──────────────────────────────────
  const handleDmNewMessage = useCallback((conversationId: number, message: any) => {
    if (conversationId === selectedConversationId) {
      setDmMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, {
          id: message.id,
          username: message.username,
          content: message.content,
          user_id: message.user_id,
          timestamp: message.created_at,
        }];
      });
    }
    // Refresh conversations list to update order
    loadConversations();
  }, [selectedConversationId]);

  const handleDmMessageEdited = useCallback((conversationId: number, messageId: number, content: string) => {
    if (conversationId === selectedConversationId) {
      setDmMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content } : m))
      );
    }
  }, [selectedConversationId]);

  const handleDmMessageDeleted = useCallback((conversationId: number, messageId: number) => {
    if (conversationId === selectedConversationId) {
      setDmMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  }, [selectedConversationId]);

  const handleDmTyping = useCallback((conversationId: number, uid: number, uname: string) => {
    if (uid === userId || conversationId !== selectedConversationId) return;
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
  }, [userId, selectedConversationId]);

  const handleDmStopTyping = useCallback((conversationId: number, uid: number) => {
    if (conversationId !== selectedConversationId) return;
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
  }, [selectedConversationId]);

  const handleFriendRequest = useCallback((fromUser: any) => {
    showSnackbar(`${fromUser.username} sent you a friend request!`);
  }, []);

  const handleFriendAccepted = useCallback((friend: any) => {
    showSnackbar(`${friend.username} accepted your friend request!`);
  }, []);

  const { isConnected: dmWsConnected, sendDmTyping, sendDmStopTyping } = useDmWebSocket({
    token,
    onDmNewMessage: handleDmNewMessage,
    onDmMessageEdited: handleDmMessageEdited,
    onDmMessageDeleted: handleDmMessageDeleted,
    onDmTyping: handleDmTyping,
    onDmStopTyping: handleDmStopTyping,
    onFriendRequest: handleFriendRequest,
    onFriendAccepted: handleFriendAccepted,
  });

  // Clear typing users when switching contexts
  useEffect(() => {
    setTypingUsers(new Map());
    wasDisconnectedRef.current = false;
  }, [selectedServer?.id]);

  useEffect(() => {
    setDmTypingUsers(new Map());
  }, [selectedConversationId]);

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

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

  useEffect(() => {
    if (token) {
      loadConversations();
    }
  }, [token, loadConversations]);

  // ─── Selection handlers ──────────────────────────────────────
  const handleSelectServer = (server: Server | null) => {
    setSelectedServer(server);
    setSelectedConversationId(null); // Deselect DM when selecting a server
    setDmMessages([]);
    setInput("");
    setEditingMessageId(null);
  };

  const handleSelectConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setSelectedServer(null); // Deselect server when selecting a DM
    setMessages([]);
    setInput("");
    setEditingMessageId(null);
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
          setSelectedServer(null);
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
      setDmMessages(data.map(m => ({
        id: m.id,
        username: m.username,
        content: m.content,
        user_id: m.user_id,
        timestamp: m.created_at,
      })));
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
      try {
        const result = await sendDirectMessage(token, selectedConversationId, input.trim(), logout);
        setInput("");
        if (!dmWsConnected) {
          await loadDmMessages();
        }
      } catch (err: any) {
        if (err.message?.includes("429")) {
          setError("You're sending messages too quickly. Please wait a moment.");
        } else {
          setError("Failed to send message");
        }
      }
    } else if (selectedServer) {
      // Server send
      sendStopTyping();
      try {
        const result: any = await sendMessage(token, input.trim(), selectedServer.id, userId!, logout);
        setInput("");
        if (!isConnected) {
          await loadMessages();
        } else if (result?.message_id) {
          sendAck(result.message_id);
        }
      } catch (err: any) {
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
        setEditingMessageId(null);
        if (!dmWsConnected) await loadDmMessages();
      } catch {
        setError("Failed to update message");
      }
    } else if (selectedServer) {
      try {
        await updateMessage(token, id, editContent, logout);
        setEditingMessageId(null);
        if (!isConnected) await loadMessages();
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
        setMenuVisible(false);
        if (!dmWsConnected) await loadDmMessages();
      } catch {
        showSnackbar("Failed to delete message");
      }
    } else if (selectedServer) {
      try {
        await deleteMessage(token, selectedServer.id, id, logout);
        setMenuVisible(false);
        if (!isConnected) await loadMessages();
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

  // Determine header title
  const headerTitle = isDmMode && activeConversation
    ? getConversationDisplayName(activeConversation)
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
    if (!token) {
      router.replace("/(tabs)/pages/Login");
    }
  }, [token]);

  if (!token) {
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
                    <TouchableOpacity onPress={() => setShowServerSidebar(true)}>
                      <Menu size={24} color="#b9bbbe" />
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
                  {!activeWsConnected && (
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
                  {error && (
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
