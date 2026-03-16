import React, { useState, useEffect, useCallback } from "react";
import { YStack, XStack, Text, Button, ScrollView, Input, Card, Separator } from "tamagui";
import { TouchableOpacity, Modal, Alert as RNAlert, Image, useWindowDimensions } from "react-native";
import { Plus, Settings, X, Users, MessageCircle } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createServer, fetchServers, joinServerWithInvite, fetchConversations, ConversationData } from "../../../../utils/api";
import { BASE_URL } from "../../../../utils/config";
import UserSettingsDialog from "./UserSettingsDialog";
import { usePreferences } from "../../../../utils/PreferencesContext";

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
  // Friend request counts
  incomingRequestsCount?: number;
  outgoingRequestsCount?: number;
  // Unread DM tracking
  unreadDmCount?: number;
  unreadConversations?: Set<number>;
  // Unread server tracking
  unreadServers?: Set<number>;
  // Friends list
  onOpenFriends?: () => void;
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
  userId,
  incomingRequestsCount = 0,
  outgoingRequestsCount = 0,
  unreadConversations = new Set(),
  unreadServers = new Set(),
  onOpenFriends,
}) => {
  const { fontSizeValue, fontFamily } = usePreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 600;

  const [modalVisible, setModalVisible] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const baseUrl = BASE_URL;

  return (
    <>
      <YStack
        width={isMobile ? "100%" : 72}
        backgroundColor="#2D2E3F"
        height="100%"
      >
        {/* Header - Mobile only */}
        {isMobile && (
          <YStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            borderBottomWidth={1}
            borderBottomColor="#1A1B26"
          >
            <Text fontSize="$5" fontWeight="700" color="white" fontFamily={fontFamily}>
              Messages
            </Text>
          </YStack>
        )}

        <ScrollView
          flex={1}
          borderColor={"red"}
          marginBottom={isMobile ? 0 : 80}
          contentContainerStyle={{
            paddingHorizontal: isMobile ? 16 : 0,
            paddingBottom: isMobile ? insets.bottom + 80 : 16
          }}
        >
          <YStack alignItems={isMobile ? "stretch" : "center"} gap={isMobile ? "$1" : "$2"}>
            {/* ─── DM Section ─────────────────────────────── */}

            {/* Friends Button */}
            <YStack alignItems="center" paddingTop={isMobile ? "$2" : "$2"} paddingHorizontal={isMobile ? "$0" : "$0"} position="relative">
              {(incomingRequestsCount > 0 || outgoingRequestsCount > 0) && (
                <YStack
                  position="absolute"
                  right={isMobile ? 8 : -4}
                  top={isMobile ? 2 : -4}
                  zIndex={10}
                  backgroundColor="#EF4444"
                  borderRadius={10}
                  minWidth={20}
                  height={20}
                  justifyContent="center"
                  alignItems="center"
                  paddingHorizontal="$1"
                >
                  <Text color="white" fontSize="$1" fontWeight="700" fontFamily={fontFamily}>
                    {incomingRequestsCount + outgoingRequestsCount}
                  </Text>
                </YStack>
              )}
              {isMobile ? (
                <TouchableOpacity
                  onPress={() => onOpenFriends?.()}
                  style={{ width: '100%' }}
                >
                  <XStack
                    backgroundColor="#171823"
                    padding="$3"
                    borderRadius="$3"
                    alignItems="center"
                    gap="$3"
                  >
                    <YStack
                      width={48}
                      height={48}
                      borderRadius={24}
                      backgroundColor="#10B981"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Users size={24} color="white" />
                    </YStack>
                    <Text color="white" fontSize="$4" fontWeight="600" fontFamily={fontFamily}>
                      Friends
                    </Text>
                  </XStack>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => onOpenFriends?.()}>
                  <YStack
                    width={56}
                    height={56}
                    borderRadius={28}
                    backgroundColor="#10B981"
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
              const hasUnread = unreadConversations.has(convo.id);

              return (
                <YStack key={`dm-${convo.id}`}>
                  <TouchableOpacity
                    onPress={() => onSelectConversation(convo.id)}
                    style={{ width: '100%' }}
                  >
                    {isMobile ? (
                      <XStack
                        backgroundColor={isSelected ? "#0EA5E9" : (hasUnread && !isSelected ? "#1A1B26" : "#171823")}
                        padding="$3"
                        borderRadius="$3"
                        alignItems="center"
                        gap="$3"
                        position="relative"
                      >
                        {/* Unread badge - mobile */}
                        {hasUnread && !isSelected && (
                          <YStack
                            position="absolute"
                            right={12}
                            top={12}
                            zIndex={10}
                            width={12}
                            height={12}
                            borderRadius={6}
                            backgroundColor="#EF4444"
                          />
                        )}
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
                            backgroundColor="#38BDF8"
                            justifyContent="center"
                            alignItems="center"
                          >
                            <Text color="white" fontSize="$5" fontWeight="700" fontFamily={fontFamily}>
                              {getFirstLetter(displayName)}
                            </Text>
                          </YStack>
                        )}
                        <YStack flex={1}>
                          <Text color="white" fontSize="$4" fontWeight={hasUnread && !isSelected ? "800" : "600"} numberOfLines={1} fontFamily={fontFamily}>
                            {displayName}
                          </Text>
                          <Text color={hasUnread && !isSelected ? "#9CA3AF" : "#6B7280"} fontSize="$2" fontFamily={fontFamily}>
                            {hasUnread && !isSelected ? "New message" : "Direct Message"}
                          </Text>
                        </YStack>
                      </XStack>
                    ) : (
                      <YStack position="relative" alignItems="center">
                        {/* Unread badge - desktop */}
                        {hasUnread && !isSelected && (
                          <YStack
                            position="absolute"
                            right={0}
                            top={0}
                            zIndex={10}
                            width={14}
                            height={14}
                            borderRadius={7}
                            backgroundColor="#EF4444"
                            borderWidth={2}
                            borderColor="#2D2E3F"
                          />
                        )}
                        <YStack
                          width={56}
                          height={56}
                          borderRadius={isSelected ? 16 : 28}
                          backgroundColor={isSelected ? "#0EA5E9" : "#171823"}
                          justifyContent="center"
                          alignItems="center"
                          hoverStyle={{ borderRadius: 16 }}
                          pressStyle={{ backgroundColor: "#0EA5E9", scale: 0.95 }}
                        >
                          {iconUrl ? (
                            <Image
                              source={{ uri: `${baseUrl}${iconUrl}` }}
                              style={{ width: 48, height: 48, borderRadius: isSelected ? 12 : 24 }}
                            />
                          ) : (
                            <Text color="white" fontSize="$4" fontWeight="700" fontFamily={fontFamily}>
                              {getFirstLetter(displayName)}
                            </Text>
                          )}
                        </YStack>
                      </YStack>
                    )}
                  </TouchableOpacity>
                </YStack>
              );
            })}

            {/* Separator between DMs and Servers */}
            {(conversations.length > 0 || true) && (
              <YStack alignItems="center" paddingVertical="$1">
                {isMobile ? (
                  <Separator borderColor="#2D2E3F" width="100%" />
                ) : (
                  <Separator borderColor="#2D2E3F" width={36} />
                )}
              </YStack>
            )}

            {/* ─── Server Section ─────────────────────────── */}

            {/* Create Server Button */}
            <YStack alignItems="center" paddingHorizontal={isMobile ? "$0" : "$0"}>
              <Button
                circular={!isMobile}
                size={isMobile ? "$4" : "$5"}
                width={isMobile ? "100%" : undefined}
                backgroundColor="#0EA5E9"
                onPress={() => setModalVisible(true)}
                icon={<Plus size={isMobile ? 20 : 24} color="white" />}
                pressStyle={{
                  backgroundColor: "#0284C7",
                }}
              >
                {isMobile && "Add Server"}
              </Button>
            </YStack>

            {/* Server List */}
            {servers.map((server) => {
              const isSelected = selectedServer?.id === server.id && !selectedConversationId;
              const hasServerUnread = unreadServers.has(server.id);

              return (
                <TouchableOpacity
                  key={server.id}
                  onPress={() => setSelectedServer(server)}
                  style={{ width: '100%' }}
                >
                  {isMobile ? (
                    <XStack
                      backgroundColor={isSelected ? "#0EA5E9" : (hasServerUnread && !isSelected ? "#1A1B26" : "#171823")}
                      padding="$3"
                      borderRadius="$3"
                      alignItems="center"
                      gap="$3"
                      position="relative"
                    >
                      {/* Server unread badge - mobile */}
                      {hasServerUnread && !isSelected && (
                        <YStack
                          position="absolute"
                          right={12}
                          top={12}
                          zIndex={10}
                          width={12}
                          height={12}
                          borderRadius={6}
                          backgroundColor="#EF4444"
                        />
                      )}
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
                          backgroundColor="#0EA5E9"
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Text color="white" fontSize="$5" fontWeight="700" fontFamily={fontFamily}>
                            {getFirstLetter(server.name)}
                          </Text>
                        </YStack>
                      )}
                      <YStack flex={1}>
                        <Text
                          color="white"
                          fontSize="$4"
                          fontWeight={hasServerUnread && !isSelected ? "800" : "600"}
                          numberOfLines={1}
                          fontFamily={fontFamily}
                        >
                          {server.name}
                        </Text>
                      </YStack>
                    </XStack>
                  ) : (
                    <YStack position="relative" alignItems="center">
                      {/* Server unread badge - desktop */}
                      {hasServerUnread && !isSelected && (
                        <YStack
                          position="absolute"
                          right={0}
                          top={0}
                          zIndex={10}
                          width={14}
                          height={14}
                          borderRadius={7}
                          backgroundColor="#EF4444"
                          borderWidth={2}
                          borderColor="#2D2E3F"
                        />
                      )}
                      <YStack
                        width={56}
                        height={56}
                        borderRadius={isSelected ? 16 : 28}
                        backgroundColor={isSelected ? "#0EA5E9" : "#171823"}
                        justifyContent="center"
                        alignItems="center"
                        hoverStyle={{
                          borderRadius: 16,
                        }}
                        pressStyle={{
                          backgroundColor: "#0EA5E9",
                          scale: 0.95,
                        }}
                      >
                        {server.icon_url ? (
                          <Image
                            source={{ uri: `${baseUrl}${server.icon_url}` }}
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: isSelected ? 12 : 24
                            }}
                          />
                        ) : (
                          <Text
                            color="white"
                            fontSize="$4"
                            fontWeight="700"
                            fontFamily={fontFamily}
                          >
                            {getFirstLetter(server.name)}
                          </Text>
                        )}
                      </YStack>
                    </YStack>
                  )}
                </TouchableOpacity>
              );
            })}

            {servers.length === 0 && conversations.length === 0 && isMobile && (
              <YStack padding="$4" alignItems="center">
                <Text color="#6B7280" fontSize="$3" textAlign="center" fontFamily={fontFamily}>
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
              backgroundColor="#171823"
              onPress={() => setSettingsOpen(true)}
              icon={<Settings size={20} color="white" />}
              hoverStyle={{
                backgroundColor: "#2D2E3F",
              }}
              pressStyle={{
                backgroundColor: "#2D2E3F",
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
            borderTopColor="#1A1B26"
            backgroundColor="#2D2E3F"
          >
            <Button
              size="$4"
              width="100%"
              backgroundColor="#171823"
              onPress={() => setSettingsOpen(true)}
              icon={<Settings size={20} color="white" />}
              pressStyle={{
                backgroundColor: "#2D2E3F",
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
            backgroundColor="#171823"
            padding={isMobile ? "$5" : "$4"}
            borderRadius="$4"
          >
            <YStack gap="$4">
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={isMobile ? "$7" : "$6"} fontWeight="700" color="white" fontFamily={fontFamily}>
                  Add a Server
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <X size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </XStack>

              <YStack gap="$3">
                <Text fontSize={isMobile ? "$5" : "$4"} fontWeight="600" color="#9CA3AF" fontFamily={fontFamily}>
                  Create a New Server
                </Text>
                <Input
                  placeholder="Enter server name"
                  value={newServerName}
                  onChangeText={setNewServerName}
                  backgroundColor="#2D2E3F"
                  borderWidth={0}
                  color="white"
                  fontSize={isMobile ? "$4" : "$3"}
                  padding="$3"
                  autoFocus
                  fontFamily={fontFamily}
                />
                <Button
                  backgroundColor="#0EA5E9"
                  onPress={createNewServer}
                  size={isMobile ? "$4" : "$3"}
                  disabled={!newServerName.trim()}
                  disabledStyle={{ opacity: 0.5 }}
                  pressStyle={{ backgroundColor: "#0284C7" }}
                >
                  Create Server
                </Button>
              </YStack>

              <XStack alignItems="center" gap="$3">
                <Separator flex={1} borderColor="#2D2E3F" />
                <Text color="#6B7280" fontSize="$2" fontFamily={fontFamily}>OR</Text>
                <Separator flex={1} borderColor="#2D2E3F" />
              </XStack>

              <YStack gap="$3">
                <Text fontSize={isMobile ? "$5" : "$4"} fontWeight="600" color="#9CA3AF" fontFamily={fontFamily}>
                  Join an Existing Server
                </Text>
                <Input
                  placeholder="Paste invite token or link"
                  value={inviteUrl}
                  onChangeText={setInviteUrl}
                  backgroundColor="#2D2E3F"
                  borderWidth={0}
                  color="white"
                  fontSize={isMobile ? "$4" : "$3"}
                  padding="$3"
                  autoCapitalize="none"
                  autoCorrect={false}
                  fontFamily={fontFamily}
                />
                <Button
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#0EA5E9"
                  onPress={joinServer}
                  size={isMobile ? "$4" : "$3"}
                  disabled={!inviteUrl.trim()}
                  disabledStyle={{ opacity: 0.5 }}
                  pressStyle={{ backgroundColor: "rgba(14,165,233,0.1)" }}
                >
                  Join Server
                </Button>
              </YStack>

              <Button
                backgroundColor="#2D2E3F"
                onPress={() => {
                  setModalVisible(false);
                  setNewServerName("");
                  setInviteUrl("");
                }}
                size={isMobile ? "$4" : "$3"}
                pressStyle={{ backgroundColor: "#2D2E3F" }}
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
          backgroundColor="#252636"
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
          <Text color="white" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>{snackbarMessage}</Text>
        </Card>
      )}
    </>
  );
};

export default React.memo(ServerSidebar);
