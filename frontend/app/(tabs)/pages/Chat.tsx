import React, { useState, useEffect, useRef } from "react";
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
  Users
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
  joinServerWithInvite,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";

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
  const { token, username, userId, logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  // Responsive breakpoint
  const isDesktop = width >= 768;
  const isTablet = width >= 600 && width < 768;
  const isMobile = width < 600;
  
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
      .then((data) => {
        setServers(data);
        if (!selectedServer && data.length > 0) {
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
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
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
    
    if (isMobile) {
      // Shorter format for mobile
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

  return (
    <Theme name="dark">
      <YStack flex={1} backgroundColor="#2f3136" paddingTop={insets.top}>
        <XStack flex={1}>
          {/* Left Sidebar - Desktop: Always visible, Mobile: Modal */}
          {isDesktop ? (
            <ServerSidebar
              servers={servers}
              selectedServer={selectedServer}
              setSelectedServer={setSelectedServer}
              setServers={setServers}
              token={token}
              setError={setError}
              logout={logout}
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
                      Servers
                    </Text>
                    <TouchableOpacity onPress={() => setShowServerSidebar(false)}>
                      <CloseIcon size={24} color="#b9bbbe" />
                    </TouchableOpacity>
                  </XStack>
                  <ServerSidebar
                    servers={servers}
                    selectedServer={selectedServer}
                    setSelectedServer={(server) => {
                      setSelectedServer(server);
                      setShowServerSidebar(false);
                    }}
                    setServers={setServers}
                    token={token}
                    setError={setError}
                    logout={logout}
                  />
                </YStack>
              </Pressable>
            </Modal>
          )}

          {/* Center Chat Panel */}
          {selectedServer ? (
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
                  <Hash size={isMobile ? 20 : 24} color="#72767d" />
                  <Text 
                    fontSize={isMobile ? "$5" : "$7"} 
                    fontWeight="600" 
                    color="white"
                    numberOfLines={1}
                    flex={1}
                  >
                    {selectedServer.name}
                  </Text>
                </XStack>
                <XStack gap="$2">
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
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ 
                      padding: isMobile ? 12 : 16,
                      paddingBottom: 16 
                    }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  />
                </YStack>

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
                    placeholder={`Message ${selectedServer.name}`}
                    value={input}
                    onChangeText={setInput}
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
                {servers.length === 0 
                  ? "Create or join a server to start chatting"
                  : "Select a server to start chatting"}
              </Text>
            </YStack>
          )}

          {/* Right Sidebar - Desktop only */}
          {isDesktop && selectedServer && showUserSidebar && (
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
                {messages.find((m) => m.id === menuMessageId)?.user_id === userId && (
                  <Pressable
                    onPress={() => {
                      const msg = messages.find((m) => m.id === menuMessageId);
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

        {/* Settings Dialog */}
        {isServerSettingsOpen && (
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