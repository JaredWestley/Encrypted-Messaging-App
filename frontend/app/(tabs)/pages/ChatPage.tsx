import React, { useState, useEffect, useRef } from "react";
import { useRoute, useNavigation } from "@react-navigation/native";
import {
  YStack,
  XStack,
  Text,
  Input,
  Button,
  Card,
  Theme,
  ScrollView,
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
} from "react-native";
import { Settings, MoreVertical, Edit3, Trash2 } from "@tamagui/lucide-icons";
import ServerSidebar from "./components/ServerSidebar";
import RightSidebar from "./components/RightSidebar";
import SettingsDialog from "./components/SettingsDialog";
import UserProfileDialog from "./components/UserProfileDialog";
import {
  apiRequest,
  deleteMessage,
  updateMessage,
  sendMessage,
  joinServerWithInvite,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

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

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Chat: { inviteCode?: string };
};

type ChatPageRouteProp = RouteProp<RootStackParamList, "Chat">;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ChatPage: React.FC = () => {
  const route = useRoute<ChatPageRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { token, username, userId, logout } = useAuth();
  
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
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const inviteCode = route.params?.inviteCode;

  // Join server from invite code
  useEffect(() => {
    const joinServerFromUrl = async () => {
      if (!token || !inviteCode) return;

      try {
        await joinServerWithInvite(token, inviteCode, logout);
        const updatedServers = await apiRequest<Server[]>(
          `${API_URL}/servers`,
          { headers: { Authorization: `Bearer ${token}` } },
          logout
        );

        const newlyJoinedServer = updatedServers.find(
          (s) => !servers.some((prev) => prev.id === s.id)
        );

        if (newlyJoinedServer) {
          setSelectedServer(newlyJoinedServer);
        } else if (updatedServers.length > 0) {
          setSelectedServer(updatedServers[0]);
        }

        setServers(updatedServers);
        showSnackbar("Successfully joined the server!");

        // Navigate away to stop re-triggering
        navigation.navigate("Chat", {});
      } catch (error: any) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.detail === "You are banned from this server") {
            showSnackbar("You are banned from this server");
            return;
          }
          if (parsed.detail === "Invalid or expired invite") {
            showSnackbar("Invalid or expired invite link");
            return;
          }
        } catch {}
        showSnackbar(error.message || "Failed to join server");
      }
    };

    joinServerFromUrl();
  }, [inviteCode, token, logout, navigation]);

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  // Load servers
  useEffect(() => {
    if (!token) return;
    apiRequest<Server[]>(
      `${API_URL}/servers`,
      { headers: { Authorization: `Bearer ${token}` } },
      logout
    )
      .then((data) => setServers(data))
      .catch(() => setError("Failed to load servers"));
  }, [token, didLeaveServer]);

  // Refresh servers after leaving
  useEffect(() => {
    if (didLeaveServer && token) {
      apiRequest<Server[]>(
        `${API_URL}/servers`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout
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

  // Load messages
  const loadMessages = async () => {
    if (!token || !selectedServer) return;
    try {
      const data = await apiRequest<Message[]>(
        `${API_URL}/messages?server_id=${selectedServer.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout
      );
      setMessages(data);
    } catch {
      setError("Failed to load messages");
    }
  };

  useEffect(() => {
    if (!token || !selectedServer) return;
    loadMessages();
    const intervalId = setInterval(loadMessages, 3000);
    return () => clearInterval(intervalId);
  }, [token, selectedServer]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !token || !selectedServer) return;
    setError(null);
    try {
      await sendMessage(token, input.trim(), selectedServer.id, userId!, logout);
      await loadMessages();
      setInput("");
    } catch (err: any) {
      if (err.message.includes("429")) {
        setError("You're sending messages too quickly. Please wait a moment.");
      } else {
        setError("Failed to send message");
      }
    }
  };

  const handleEditSave = async (id: number) => {
    if (!token || !selectedServer) return;
    try {
      await updateMessage(token, id, editContent, logout);
      await loadMessages();
      setEditingMessageId(null);
    } catch {
      setError("Failed to update message");
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !selectedServer) return;
    try {
      await deleteMessage(token, selectedServer.id, id, logout);
      await loadMessages();
      setMenuVisible(false);
    } catch {
      showSnackbar("Failed to delete message");
    }
  };

  const handleUserEdit = (user: User) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Invalid date";
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
    RNAlert.alert("Delete Message", "Are you sure you want to delete this message?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(id) },
    ]);
    setMenuVisible(false);
  };

  const renderMessage = ({ item: msg }: { item: Message }) => (
    <Pressable
      onLongPress={() => openMessageMenu(msg.id, msg.content)}
      style={{ marginBottom: 8 }}
    >
      <Card
        backgroundColor={editingMessageId === msg.id ? "#40444b" : "#2c2f33"}
        padding="$3"
        borderRadius="$3"
        pressStyle={{
          backgroundColor: "#3a3c43",
        }}
      >
        {editingMessageId === msg.id ? (
          <YStack>
            <Input
              value={editContent}
              onChangeText={setEditContent}
              multiline
              numberOfLines={4}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              placeholder="Edit your message"
              autoFocus
            />
            <XStack justifyContent="flex-end">
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
          <YStack>
            <XStack alignItems="center" justifyContent="space-between">
              <XStack alignItems="center" flex={1}>
                <Pressable onPress={() => handleUserEdit({ id: msg.user_id, username: msg.username })}>
                  <Text fontWeight="700" color="white" fontSize="$4">
                    {msg.username}
                  </Text>
                </Pressable>
                <Text fontSize="$2" color="#b9bbbe">
                  {formatTimestamp(msg.timestamp)}
                </Text>
              </XStack>
              <TouchableOpacity onPress={() => openMessageMenu(msg.id, msg.content)}>
                <MoreVertical size={20} color="#b9bbbe" />
              </TouchableOpacity>
            </XStack>
            <Text color="#dcddde" fontSize="$3">
              {msg.content}
            </Text>
          </YStack>
        )}
      </Card>
    </Pressable>
  );

  if (!token) {
    return (
      <YStack flex={1} padding="$4" backgroundColor="#2f3136" justifyContent="center" alignItems="center">
        <Text color="#dcddde" fontSize="$6">
          You must be logged in to view this page.
        </Text>
      </YStack>
    );
  }

  return (
    <Theme name="dark">
      <YStack flex={1} backgroundColor="#2f3136">
        <XStack flex={1}>
          {/* Left Sidebar - Servers */}
          <ServerSidebar
            servers={servers}
            selectedServer={selectedServer}
            setSelectedServer={setSelectedServer}
            setServers={setServers}
            token={token}
            setError={setError}
          />

          {/* Center Chat Panel */}
          {selectedServer ? (
            <YStack flex={1} backgroundColor="#36393f">
              {/* Header */}
              <XStack
                height={64}
                paddingHorizontal="$4"
                alignItems="center"
                justifyContent="space-between"
                backgroundColor="#2f3136"
                borderBottomWidth={1}
                borderBottomColor="#202225"
              >
                <Text fontSize="$7" fontWeight="600" color="white">
                  {selectedServer.name}
                </Text>
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
                  Settings
                </Button>
              </XStack>

              {/* Messages List */}
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
              >
                <YStack flex={1} backgroundColor="#2c2f33" padding="$3">
                  {error && (
                    <Card backgroundColor="#f44336" padding="$3" marginBottom="$2" borderRadius="$3">
                      <Text color="white" fontWeight="600">
                        {error}
                      </Text>
                    </Card>
                  )}
                  <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  />
                </YStack>

                {/* Input Box */}
                <XStack
                  padding="$3"
                  backgroundColor="#2f3136"
                  borderTopWidth={1}
                  borderTopColor="#202225"
                  alignItems="flex-end"
                >
                  <Input
                    flex={1}
                    placeholder="Type a message..."
                    value={input}
                    onChangeText={setInput}
                    multiline
                    numberOfLines={1}
                    maxLength={2000}
                    backgroundColor="#40444b"
                    borderWidth={0}
                    color="white"
                    borderRadius="$3"
                    padding="$3"
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
                  >
                    Send
                  </Button>
                </XStack>
              </KeyboardAvoidingView>
            </YStack>
          ) : (
            <YStack flex={1} backgroundColor="#36393f" justifyContent="center" alignItems="center">
              <Text color="#72767d" fontSize="$6" fontWeight="600">
                Select a server to start chatting
              </Text>
            </YStack>
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
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
            onPress={() => setMenuVisible(false)}
          >
            <Card backgroundColor="#2f3136" padding="$0" borderRadius="$3" width={200}>
              <YStack>
                {messages.find((m) => m.id === menuMessageId)?.user_id === userId && (
                  <Pressable
                    onPress={() => {
                      const msg = messages.find((m) => m.id === menuMessageId);
                      if (msg) handleEditClick(msg.id, msg.content);
                    }}
                  >
                    <XStack padding="$3" alignItems="center" backgroundColor="#2f3136" hoverStyle={{ backgroundColor: "#5865F2" }}>
                      <Edit3 size={16} color="white" />
                      <Text color="white">Edit</Text>
                    </XStack>
                  </Pressable>
                )}
                <Pressable onPress={() => menuMessageId && handleDeleteClick(menuMessageId)}>
                  <XStack padding="$3" alignItems="center" backgroundColor="#2f3136" hoverStyle={{ backgroundColor: "#f04747" }}>
                    <Trash2 size={16} color="#f04747" />
                    <Text color="#f04747">Delete</Text>
                  </XStack>
                </Pressable>
              </YStack>
            </Card>
          </Pressable>
        </Modal>

        {/* Snackbar */}
        {snackbarVisible && (
          <Card
            position="absolute"
            bottom={20}
            alignSelf="center"
            backgroundColor="#323232"
            padding="$3"
            borderRadius="$3"
            enterStyle={{
              opacity: 0,
              y: 20,
            }}
            exitStyle={{
              opacity: 0,
              y: 20,
            }}
          >
            <Text color="white">{snackbarMessage}</Text>
          </Card>
        )}
      </YStack>
    </Theme>
  );
};

export default ChatPage;