import React, { useState, useEffect, useCallback } from "react";
import { YStack, XStack, Text, Button, ScrollView, Input, Card, Separator } from "tamagui";
import { TouchableOpacity, Modal, Alert as RNAlert, Image, useWindowDimensions } from "react-native";
import { Plus, Settings, X, Users, MessageCircle } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createServer, fetchServers, joinServerWithInvite, fetchConversations, ConversationData } from "../../utils/api";
import { useAuth } from "../../utils/AuthContext";
import UserSettingsDialog from "./UserSettingsDialog";
import FriendsList from "./FriendsList";

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface ServerSidebarProps {
  servers: Server[];
  selectedServer: Server | null;
  setSelectedServer: (server: Server | null) => void;
  setServers: React.Dispatch<React.SetStateAction<Server[]>>;
  token: string;
  setError: (error: string | null) => void;
  logout: () => void;
  // DM props
  selectedConversationId: number | null;
  onSelectConversation: (conversationId: number) => void;
  conversations: ConversationData[];
  onConversationsChanged: () => void;
  userId: number;
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  servers,
  selectedServer,
  setSelectedServer,
  setServers,
  token,
  setError,
  logout,
  selectedConversationId,
  onSelectConversation,
  conversations,
  onConversationsChanged,
  userId,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 600;

  const [modalVisible, setModalVisible] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsListOpen, setFriendsListOpen] = useState(false);

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  const createNewServer = async () => {
    if (!newServerName.trim() || !token) return;
    try {
      await createServer(token, newServerName.trim(), logout);
      const updatedServers = (await fetchServers(token, logout)) as Server[];
      setServers(updatedServers);
      const newlyCreated = updatedServers[updatedServers.length - 1];
      setSelectedServer(newlyCreated);
      setModalVisible(false);
      setNewServerName("");
      setInviteUrl("");
      showSnackbar("Server created successfully!");
    } catch (error: any) {
      setError(error.message || "Error creating server");
    }
  };

  const extractInviteToken = (input: string): string => {
    const trimmed = input.trim();
    const parts = trimmed.split("/invite/");
    if (parts.length === 2) {
      return parts[1].split(/[?#]/)[0];
    }
    return trimmed;
  };

  const joinServer = async () => {
    if (!inviteUrl.trim() || !token) return;

    const tokenPart = extractInviteToken(inviteUrl.trim());
    if (!tokenPart) {
      setError("Please enter an invite token or link");
      return;
    }

    try {
      await joinServerWithInvite(token, tokenPart, logout);
      const updatedServers = (await fetchServers(token, logout)) as Server[];
      setServers(updatedServers);

      const newlyJoinedServer = updatedServers.find(
        (s) => !servers.some((prev) => prev.id === s.id)
      );

      if (newlyJoinedServer) {
        setSelectedServer(newlyJoinedServer);
        showSnackbar("Joined server successfully");
      } else if (updatedServers.length > 0) {
        setSelectedServer(updatedServers[0]);
      }

      setModalVisible(false);
      setNewServerName("");
      setInviteUrl("");
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

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  const getConversationDisplayName = (convo: ConversationData): string => {
    if (convo.name) return convo.name;
    const other = convo.members.find(m => m.id !== userId);
    return other?.username || "Unknown";
  };

  const getConversationIcon = (convo: ConversationData): string | null => {
    const other = convo.members.find(m => m.id !== userId);
    return other?.icon_url || null;
  };

  const handleStartConversation = (conversationId: number) => {
    onSelectConversation(conversationId);
    onConversationsChanged();
  };

  const baseUrl = "http://localhost:8000";

  return (
    <>
      <YStack
        width={isMobile ? "100%" : 72}
        backgroundColor="#202225"
        height="100%"
      >
        {/* Header - Mobile only */}
        {isMobile && (
          <YStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            borderBottomWidth={1}
            borderBottomColor="#18191c"
          >
            <Text fontSize="$5" fontWeight="700" color="white">
              Messages
            </Text>
          </YStack>
        )}

        <ScrollView
          flex={1}
          marginBottom={isMobile ? 0 : 80}
          contentContainerStyle={{
            paddingHorizontal: isMobile ? 16 : 0,
            paddingBottom: isMobile ? insets.bottom + 80 : 16
          }}
        >
          <YStack alignItems={isMobile ? "stretch" : "center"} gap={isMobile ? "$1" : "$2"}>
            {/* ─── DM Section ─────────────────────────────── */}

            {/* Friends Button */}
            <YStack alignItems="center" paddingTop={isMobile ? "$2" : "$2"} paddingHorizontal={isMobile ? "$0" : "$0"}>
              {isMobile ? (
                <TouchableOpacity
                  onPress={() => setFriendsListOpen(true)}
                  style={{ width: '100%' }}
                >
                  <XStack
                    backgroundColor="#2f3136"
                    padding="$3"
                    borderRadius="$3"
                    alignItems="center"
                    gap="$3"
                  >
                    <YStack
                      width={48}
                      height={48}
                      borderRadius={24}
                      backgroundColor="#43b581"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Users size={24} color="white" />
                    </YStack>
                    <Text color="white" fontSize="$4" fontWeight="600">
                      Friends
                    </Text>
                  </XStack>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setFriendsListOpen(true)}>
                  <YStack
                    width={56}
                    height={56}
                    borderRadius={28}
                    backgroundColor="#43b581"
                    justifyContent="center"
                    alignItems="center"
                    hoverStyle={{ borderRadius: 16 }}
                    pressStyle={{ backgroundColor: "#3ca374", scale: 0.95 }}
                  >
                    <Users size={24} color="white" />
                  </YStack>
                </TouchableOpacity>
              )}
            </YStack>

            {/* DM Conversations */}
            {conversations.map((convo) => {
              const displayName = getConversationDisplayName(convo);
              const iconUrl = getConversationIcon(convo);
              const isSelected = selectedConversationId === convo.id && !selectedServer;

              return (
                <TouchableOpacity
                  key={`dm-${convo.id}`}
                  onPress={() => onSelectConversation(convo.id)}
                  style={{ width: '100%' }}
                >
                  {isMobile ? (
                    <XStack
                      backgroundColor={isSelected ? "#5865F2" : "#2f3136"}
                      padding="$3"
                      borderRadius="$3"
                      alignItems="center"
                      gap="$3"
                    >
                      {iconUrl ? (
                        <Image
                          source={{ uri: `${baseUrl}${iconUrl}` }}
                          style={{ width: 48, height: 48, borderRadius: 24 }}
                        />
                      ) : (
                        <YStack
                          width={48}
                          height={48}
                          borderRadius={24}
                          backgroundColor="#7289da"
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Text color="white" fontSize="$5" fontWeight="700">
                            {getFirstLetter(displayName)}
                          </Text>
                        </YStack>
                      )}
                      <YStack flex={1}>
                        <Text color="white" fontSize="$4" fontWeight="600" numberOfLines={1}>
                          {displayName}
                        </Text>
                        <Text color="#72767d" fontSize="$2">
                          Direct Message
                        </Text>
                      </YStack>
                    </XStack>
                  ) : (
                    <YStack
                      width={56}
                      height={56}
                      borderRadius={isSelected ? 16 : 28}
                      backgroundColor={isSelected ? "#5865F2" : "#7289da"}
                      justifyContent="center"
                      alignItems="center"
                      hoverStyle={{ borderRadius: 16 }}
                      pressStyle={{ backgroundColor: "#5865F2", scale: 0.95 }}
                    >
                      {iconUrl ? (
                        <Image
                          source={{ uri: `${baseUrl}${iconUrl}` }}
                          style={{ width: 48, height: 48, borderRadius: isSelected ? 12 : 24 }}
                        />
                      ) : (
                        <Text color="white" fontSize="$4" fontWeight="700">
                          {getFirstLetter(displayName)}
                        </Text>
                      )}
                    </YStack>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Separator between DMs and Servers */}
            {(conversations.length > 0 || true) && (
              <YStack alignItems="center" paddingVertical="$1">
                {isMobile ? (
                  <Separator borderColor="#40444b" width="100%" />
                ) : (
                  <Separator borderColor="#40444b" width={36} />
                )}
              </YStack>
            )}

            {/* ─── Server Section ─────────────────────────── */}

            {/* Create Server Button */}
            <YStack alignItems="center" paddingHorizontal={isMobile ? "$0" : "$0"}>
              <Button
                circular={!isMobile}
                size={isMobile ? "$4" : "$6"}
                width={isMobile ? "100%" : undefined}
                backgroundColor="#5865F2"
                onPress={() => setModalVisible(true)}
                icon={<Plus size={isMobile ? 20 : 24} color="white" />}
                pressStyle={{
                  backgroundColor: "#4752C4",
                }}
              >
                {isMobile && "Add Server"}
              </Button>
            </YStack>

            {/* Server List */}
            {servers.map((server) => (
              <TouchableOpacity
                key={server.id}
                onPress={() => setSelectedServer(server)}
                style={{ width: '100%' }}
              >
                {isMobile ? (
                  <XStack
                    backgroundColor={selectedServer?.id === server.id && !selectedConversationId ? "#5865F2" : "#2f3136"}
                    padding="$3"
                    borderRadius="$3"
                    alignItems="center"
                    gap="$3"
                  >
                    {server.icon_url ? (
                      <Image
                        source={{ uri: `${baseUrl}${server.icon_url}` }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                      />
                    ) : (
                      <YStack
                        width={48}
                        height={48}
                        borderRadius={24}
                        backgroundColor="#5865F2"
                        justifyContent="center"
                        alignItems="center"
                      >
                        <Text color="white" fontSize="$5" fontWeight="700">
                          {getFirstLetter(server.name)}
                        </Text>
                      </YStack>
                    )}
                    <YStack flex={1}>
                      <Text
                        color="white"
                        fontSize="$4"
                        fontWeight="600"
                        numberOfLines={1}
                      >
                        {server.name}
                      </Text>
                    </YStack>
                  </XStack>
                ) : (
                  <YStack
                    width={56}
                    height={56}
                    borderRadius={(selectedServer?.id === server.id && !selectedConversationId) ? 16 : 28}
                    backgroundColor={(selectedServer?.id === server.id && !selectedConversationId) ? "#5865F2" : "#2f3136"}
                    justifyContent="center"
                    alignItems="center"
                    hoverStyle={{
                      borderRadius: 16,
                    }}
                    pressStyle={{
                      backgroundColor: "#5865F2",
                      scale: 0.95,
                    }}
                  >
                    {server.icon_url ? (
                      <Image
                        source={{ uri: `${baseUrl}${server.icon_url}` }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: (selectedServer?.id === server.id && !selectedConversationId) ? 12 : 24
                        }}
                      />
                    ) : (
                      <Text
                        color="white"
                        fontSize="$4"
                        fontWeight="700"
                      >
                        {getFirstLetter(server.name)}
                      </Text>
                    )}
                  </YStack>
                )}
              </TouchableOpacity>
            ))}

            {servers.length === 0 && conversations.length === 0 && isMobile && (
              <YStack padding="$4" alignItems="center">
                <Text color="#72767d" fontSize="$3" textAlign="center">
                  Add friends or create a server to get started!
                </Text>
              </YStack>
            )}
          </YStack>
        </ScrollView>

        {/* Settings Button */}
        {!isMobile ? (
          <YStack
            position="absolute"
            bottom={16}
            left={8}
            alignItems="center"
            zIndex={10}
          >
            <Button
              circular
              size="$5"
              backgroundColor="#2f3136"
              onPress={() => setSettingsOpen(true)}
              icon={<Settings size={20} color="white" />}
              hoverStyle={{
                backgroundColor: "#40444b",
              }}
              pressStyle={{
                backgroundColor: "#40444b",
                scale: 0.95,
              }}
            />
          </YStack>
        ) : (
          <YStack
            paddingHorizontal="$4"
            paddingBottom={insets.bottom + 40}
            paddingTop="$3"
            borderTopWidth={1}
            borderTopColor="#18191c"
            backgroundColor="#202225"
          >
            <Button
              size="$4"
              width="100%"
              backgroundColor="#2f3136"
              onPress={() => setSettingsOpen(true)}
              icon={<Settings size={20} color="white" />}
              pressStyle={{
                backgroundColor: "#40444b",
              }}
            >
              Settings
            </Button>
          </YStack>
        )}

        {/* User Settings Dialog */}
        <UserSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          logout={logout}
          token={token}
        />
      </YStack>

      {/* Friends List Modal */}
      <FriendsList
        open={friendsListOpen}
        onClose={() => setFriendsListOpen(false)}
        onStartConversation={handleStartConversation}
      />

      {/* Create/Join Server Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <YStack
          flex={1}
          backgroundColor="rgba(0,0,0,0.7)"
          justifyContent="center"
          alignItems="center"
          padding="$4"
        >
          <Card
            width={isMobile ? "100%" : "90%"}
            maxWidth={500}
            backgroundColor="#2f3136"
            padding={isMobile ? "$5" : "$4"}
            borderRadius="$4"
          >
            <YStack gap="$4">
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={isMobile ? "$7" : "$6"} fontWeight="700" color="white">
                  Add a Server
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <X size={24} color="#b9bbbe" />
                </TouchableOpacity>
              </XStack>

              <YStack gap="$3">
                <Text fontSize={isMobile ? "$5" : "$4"} fontWeight="600" color="#b9bbbe">
                  Create a New Server
                </Text>
                <Input
                  placeholder="Enter server name"
                  value={newServerName}
                  onChangeText={setNewServerName}
                  backgroundColor="#40444b"
                  borderWidth={0}
                  color="white"
                  fontSize={isMobile ? "$4" : "$3"}
                  padding="$3"
                  autoFocus
                />
                <Button
                  backgroundColor="#5865F2"
                  onPress={createNewServer}
                  size={isMobile ? "$4" : "$3"}
                  disabled={!newServerName.trim()}
                  disabledStyle={{ opacity: 0.5 }}
                  pressStyle={{ backgroundColor: "#4752C4" }}
                >
                  Create Server
                </Button>
              </YStack>

              <XStack alignItems="center" gap="$3">
                <Separator flex={1} borderColor="#40444b" />
                <Text color="#72767d" fontSize="$2">OR</Text>
                <Separator flex={1} borderColor="#40444b" />
              </XStack>

              <YStack gap="$3">
                <Text fontSize={isMobile ? "$5" : "$4"} fontWeight="600" color="#b9bbbe">
                  Join an Existing Server
                </Text>
                <Input
                  placeholder="Paste invite token or link"
                  value={inviteUrl}
                  onChangeText={setInviteUrl}
                  backgroundColor="#40444b"
                  borderWidth={0}
                  color="white"
                  fontSize={isMobile ? "$4" : "$3"}
                  padding="$3"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#5865F2"
                  onPress={joinServer}
                  size={isMobile ? "$4" : "$3"}
                  disabled={!inviteUrl.trim()}
                  disabledStyle={{ opacity: 0.5 }}
                  pressStyle={{ backgroundColor: "rgba(88,101,242,0.1)" }}
                >
                  Join Server
                </Button>
              </YStack>

              <Button
                backgroundColor="#40444b"
                onPress={() => {
                  setModalVisible(false);
                  setNewServerName("");
                  setInviteUrl("");
                }}
                size={isMobile ? "$4" : "$3"}
                pressStyle={{ backgroundColor: "#202225" }}
              >
                Cancel
              </Button>
            </YStack>
          </Card>
        </YStack>
      </Modal>

      {/* Snackbar */}
      {snackbarVisible && (
        <Card
          position="absolute"
          bottom={insets.bottom + 20}
          left={isMobile ? 16 : "50%"}
          transform={isMobile ? undefined : [{ translateX: -150 }]}
          width={isMobile ? width - 32 : 300}
          backgroundColor="#323232"
          padding={isMobile ? "$4" : "$3"}
          borderRadius="$4"
          shadowColor="black"
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={0.3}
          shadowRadius={8}
          enterStyle={{
            opacity: 0,
            y: 20,
          }}
        >
          <Text color="white" fontSize={isMobile ? "$4" : "$3"}>{snackbarMessage}</Text>
        </Card>
      )}
    </>
  );
};

export default ServerSidebar;
