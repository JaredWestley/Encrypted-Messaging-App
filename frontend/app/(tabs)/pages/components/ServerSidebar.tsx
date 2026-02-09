import React, { useState } from "react";
import { YStack, XStack, Text, Button, ScrollView, Input, Card, Avatar, Separator } from "tamagui";
import { TouchableOpacity, Modal, Alert as RNAlert, Image, useWindowDimensions } from "react-native";
import { Plus, Settings, X } from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createServer, fetchServers, joinServerWithInvite } from "../../utils/api";
import { useAuth } from "../../utils/AuthContext";
import UserSettingsDialog from "./UserSettingsDialog";

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface ServerSidebarProps {
  servers: Server[];
  selectedServer: Server | null;
  setSelectedServer: (server: Server) => void;
  setServers: React.Dispatch<React.SetStateAction<Server[]>>;
  token: string;
  setError: (error: string | null) => void;
  logout: () => void;
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  servers,
  selectedServer,
  setSelectedServer,
  setServers,
  token,
  setError,
  logout,
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

  const extractInviteToken = (url: string): string | null => {
    try {
      const parts = url.split("/invite/");
      if (parts.length === 2) return parts[1].split(/[?#]/)[0];
      return null;
    } catch {
      return null;
    }
  };

  const joinServer = async () => {
    if (!inviteUrl.trim() || !token) return;

    const tokenPart = extractInviteToken(inviteUrl.trim());
    if (!tokenPart) {
      setError("Invalid invite URL format");
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
              Your Servers
            </Text>
          </YStack>
        )}

        {/* Create Server Button */}
        <YStack alignItems="center" paddingTop={isMobile ? "$3" : "$2"} paddingHorizontal={isMobile ? "$4" : "$0"}>
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
        <ScrollView 
          flex={1} 
          marginTop="$3" 
          marginBottom={isMobile ? 0 : 80}
          contentContainerStyle={{
            paddingHorizontal: isMobile ? 16 : 0,
            paddingBottom: isMobile ? insets.bottom + 80 : 16
          }}
        >
          <YStack alignItems={isMobile ? "stretch" : "center"} gap={isMobile ? "$2" : "$3"}>
            {servers.map((server) => (
              <TouchableOpacity 
                key={server.id} 
                onPress={() => setSelectedServer(server)}
                style={{ width: '100%' }}
              >
                {isMobile ? (
                  // Mobile: Full-width list item
                  <XStack
                    backgroundColor={selectedServer?.id === server.id ? "#5865F2" : "#2f3136"}
                    padding="$3"
                    borderRadius="$3"
                    alignItems="center"
                    gap="$3"
                    pressStyle={{
                      backgroundColor: selectedServer?.id === server.id ? "#4752C4" : "#40444b",
                    }}
                  >
                    {server.icon_url ? (
                      <Image
                        source={{ uri: `${baseUrl}${server.icon_url}` }}
                        style={{ width: 48, height: 48, borderRadius: 24 }}
                      />
                    ) : (
                      <Avatar circular size="$5" backgroundColor="#5865F2">
                        <Avatar.Fallback backgroundColor="#5865F2">
                          <Text color="white" fontSize="$5" fontWeight="700">
                            {getFirstLetter(server.name)}
                          </Text>
                        </Avatar.Fallback>
                      </Avatar>
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
                  // Desktop: Circular icon
                  <YStack
                    width={56}
                    height={56}
                    borderRadius={selectedServer?.id === server.id ? 16 : 28} // Rounded square when selected
                    backgroundColor={selectedServer?.id === server.id ? "#5865F2" : "#2f3136"} // Show background even when not selected
                    justifyContent="center"
                    alignItems="center"
                    hoverStyle={{
                      borderRadius: 16, // Rounded square on hover
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
                          borderRadius: selectedServer?.id === server.id ? 12 : 24 
                        }}
                      />
                    ) : (
                      <Avatar circular size="$5" backgroundColor={selectedServer?.id === server.id ? "white" : "#5865F2"}>
                        <Avatar.Fallback backgroundColor={selectedServer?.id === server.id ? "white" : "#5865F2"}>
                          <Text 
                            color={selectedServer?.id === server.id ? "#5865F2" : "white"} 
                            fontSize="$4" 
                            fontWeight="700"
                          >
                            {getFirstLetter(server.name)}
                          </Text>
                        </Avatar.Fallback>
                      </Avatar>
                    )}
                  </YStack>
                )}
              </TouchableOpacity>
            ))}
            
            {servers.length === 0 && isMobile && (
              <YStack padding="$4" alignItems="center">
                <Text color="#72767d" fontSize="$3" textAlign="center">
                  No servers yet. Create or join one to get started!
                </Text>
              </YStack>
            )}
          </YStack>
        </ScrollView>

        {/* Settings Button */}
        {!isMobile ? (
          // Desktop: Fixed at bottom
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
          // Mobile: At bottom with safe area
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
              {/* Header */}
              <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={isMobile ? "$7" : "$6"} fontWeight="700" color="white">
                  Add a Server
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <X size={24} color="#b9bbbe" />
                </TouchableOpacity>
              </XStack>

              {/* Create Server Section */}
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

              {/* Divider */}
              <XStack alignItems="center" gap="$3">
                <Separator flex={1} borderColor="#40444b" />
                <Text color="#72767d" fontSize="$2">OR</Text>
                <Separator flex={1} borderColor="#40444b" />
              </XStack>

              {/* Join Server Section */}
              <YStack gap="$3">
                <Text fontSize={isMobile ? "$5" : "$4"} fontWeight="600" color="#b9bbbe">
                  Join an Existing Server
                </Text>
                <Input
                  placeholder="Paste invite link"
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

              {/* Close Button */}
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