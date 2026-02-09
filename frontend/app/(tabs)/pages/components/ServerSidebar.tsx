import React, { useState } from "react";
import { YStack, XStack, Text, Button, ScrollView, Input, Card, Avatar } from "tamagui";
import { TouchableOpacity, Modal, Alert as RNAlert, Image } from "react-native";
import { Plus, Settings } from "@tamagui/lucide-icons";
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
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  servers,
  selectedServer,
  setSelectedServer,
  setServers,
  token,
  setError,
}) => {
  const { logout } = useAuth();
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

  return (
    <>
      <YStack width={160} backgroundColor="#202225" height="100%">
        {/* Create Server Button */}
        <YStack alignItems="center" paddingTop="$2">
          <Button
            circular
            size="$6"
            backgroundColor="#5865F2"
            onPress={() => setModalVisible(true)}
            icon={<Plus size={24} color="white" />}
            pressStyle={{
              backgroundColor: "#4752C4",
            }}
          />
        </YStack>

        {/* Server List */}
        <ScrollView flex={1} marginTop="$3" marginBottom={64}>
          <YStack alignItems="center">
            {servers.map((server) => (
              <TouchableOpacity key={server.id} onPress={() => setSelectedServer(server)}>
                <YStack
                  width={56}
                  height={56}
                  borderRadius={28}
                  backgroundColor={selectedServer?.id === server.id ? "#5865F2" : "transparent"}
                  justifyContent="center"
                  alignItems="center"
                  pressStyle={{
                    backgroundColor: "#4752C4",
                  }}
                >
                  {server.icon_url ? (
                    <Image
                      source={{ uri: `http://localhost:8000${server.icon_url}` }}
                      style={{ width: 40, height: 40, borderRadius: 20 }}
                    />
                  ) : (
                    <Avatar circular size="$5" backgroundColor="#757575">
                      <Avatar.Fallback backgroundColor="#757575">
                        <Text color="white" fontSize="$4" fontWeight="700">
                          {getFirstLetter(server.name)}
                        </Text>
                      </Avatar.Fallback>
                    </Avatar>
                  )}
                </YStack>
              </TouchableOpacity>
            ))}
          </YStack>
        </ScrollView>

        {/* Settings Button */}
        <YStack position="absolute" bottom={30} alignSelf="center">
          <Button
            circular
            size="$5"
            backgroundColor="#2f3136"
            onPress={() => setSettingsOpen(true)}
            icon={<Settings size={20} color="white" />}
            pressStyle={{
              backgroundColor: "#40444b",
            }}
          />
        </YStack>

        {/* User Settings Dialog */}
        <UserSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          logout={logout}
          token={token}
        />
      </YStack>

      {/* Create/Join Server Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" alignItems="center" padding="$4">
          <Card width="90%" maxWidth={400} backgroundColor="#2f3136" padding="$4" borderRadius="$4">
            <YStack>
              {/* Create Server Section */}
              <YStack>
                <Text fontSize="$6" fontWeight="700" color="white">
                  Create a Server
                </Text>
                <Input
                  placeholder="Server Name"
                  value={newServerName}
                  onChangeText={setNewServerName}
                  backgroundColor="#40444b"
                  borderWidth={0}
                  color="white"
                  autoFocus
                />
                <Button backgroundColor="#5865F2" onPress={createNewServer}>
                  Create
                </Button>
              </YStack>

              {/* Divider */}
              <YStack height={1} backgroundColor="#202225" marginVertical="$2" />

              {/* Join Server Section */}
              <YStack>
                <Text fontSize="$6" fontWeight="700" color="white">
                  Join a Server
                </Text>
                <Input
                  placeholder="Invite Link"
                  value={inviteUrl}
                  onChangeText={setInviteUrl}
                  backgroundColor="#40444b"
                  borderWidth={0}
                  color="white"
                />
                <Button
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#5865F2"
                  onPress={joinServer}
                >
                  Join Server
                </Button>
              </YStack>

              {/* Close Button */}
              <Button
                backgroundColor="transparent"
                onPress={() => {
                  setModalVisible(false);
                  setNewServerName("");
                  setInviteUrl("");
                }}
                marginTop="$2"
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
          bottom={20}
          alignSelf="center"
          backgroundColor="#323232"
          padding="$3"
          borderRadius="$3"
          enterStyle={{
            opacity: 0,
            y: 20,
          }}
        >
          <Text color="white">{snackbarMessage}</Text>
        </Card>
      )}
    </>
  );
};

export default ServerSidebar;