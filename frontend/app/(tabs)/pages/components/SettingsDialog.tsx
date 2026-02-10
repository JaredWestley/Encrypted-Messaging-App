import React, { useState } from "react";
import { YStack, XStack, Text, Button, Input, ScrollView, Card, Tabs } from "tamagui";
import { Modal, TouchableOpacity, Alert as RNAlert, useWindowDimensions } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { leaveServer, generateInviteLink } from "../../utils/api";
import RolesSettings from "./RolesSettings";
import AdminPanel from "./AdminPanel";
import ServerSettings from "./ServerSettings";
import InviteList from "./InviteList";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedServer: Server | null;
  token: string;
  userId: number;
  setServers: React.Dispatch<React.SetStateAction<Server[]>>;
  setSelectedServer: (server: Server | null) => void;
  setDidLeaveServer: (val: boolean) => void;
  logout: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  selectedServer,
  token,
  userId,
  setServers,
  setSelectedServer,
  setDidLeaveServer,
  logout,
}) => {
  const serverId = selectedServer?.id ?? 0;
  const serverName = selectedServer?.name;
  const selectedServerOwnerId = selectedServer?.owner_id ?? 0;
  const isOwner = userId === selectedServerOwnerId;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [selectedPage, setSelectedPage] = useState<"Admin" | "Invite" | "Roles" | "Server Settings">("Admin");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteRefreshCounter, setInviteRefreshCounter] = useState(0);

  const handleLeave = async () => {
    if (isOwner) {
      RNAlert.alert("Cannot Leave", "You are the owner and cannot leave your own server");
      return;
    }
    
    RNAlert.alert(
      "Leave Server",
      "Are you sure you want to leave this server?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await leaveServer(token, serverId, logout);
              setDidLeaveServer(true);
              onClose();
            } catch (err: any) {
              RNAlert.alert("Error", err.message || "Failed to leave server");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleGenerateInvite = async () => {
    try {
      setLoading(true);
      const res = await generateInviteLink(token, serverId, logout);
      // Note: In React Native, you might need to construct this differently
      // For now using a placeholder - you'd need to handle deep linking
      const generatedLink = `yourapp://invite/${res.token}`;
      setInviteLink(generatedLink);
      setInviteRefreshCounter((prev) => prev + 1);
    } catch (err: any) {
      RNAlert.alert("Error", err.message || "Failed to generate invite");
    } finally {
      setLoading(false);
    }
  };

  const pages = ["Admin", "Invite", "Roles", "Server Settings"] as const;

  const renderContent = () => (
    <>
      {selectedPage === "Admin" && (
        <AdminPanel
          serverId={serverId}
          token={token}
          logout={logout}
          selectedServerOwnerId={selectedServerOwnerId}
        />
      )}

      {selectedPage === "Invite" && (
        <YStack>
          <Text fontSize="$6" fontWeight="700" color="white">
            Invite People to Server
          </Text>

          <Button
            backgroundColor="#5865F2"
            onPress={handleGenerateInvite}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Invite Link"}
          </Button>

          {inviteLink && (
            <YStack>
              <Text fontSize="$3" color="#b9bbbe">
                Newly generated invite:
              </Text>
              <Card backgroundColor="#36393f" padding="$3" borderRadius="$3">
                <XStack justifyContent="space-between" alignItems="center">
                  <Text color="white" fontSize="$3" flex={1} numberOfLines={1}>
                    {inviteLink}
                  </Text>
                  <Button
                    size="$3"
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="#5865F2"
                    onPress={() => {
                      // TODO: Implement clipboard copy
                      RNAlert.alert("Copied", "Invite link copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </XStack>
              </Card>
            </YStack>
          )}

          <YStack marginTop="$4">
            <Text fontSize="$5" fontWeight="600" color="white">
              Existing Invite Links
            </Text>
            <InviteList
              serverId={serverId}
              token={token}
              logout={logout}
              refreshTrigger={inviteRefreshCounter}
            />
          </YStack>
        </YStack>
      )}

      {selectedPage === "Roles" && (
        <RolesSettings serverId={serverId} token={token} logout={logout} />
      )}

      {selectedPage === "Server Settings" && (
        <ServerSettings
          serverId={serverId}
          token={token}
          logout={logout}
          currentIcon={selectedServer?.icon_url}
          currentName={serverName || ""}
          isOwner={isOwner}
          onServerRenamed={(newName) => {
            console.log("Server renamed to", newName);
          }}
          onServerDeleted={() => {
            setDidLeaveServer(true);
            onClose();
          }}
        />
      )}
    </>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <YStack flex={1} backgroundColor="rgba(0,0,0,0.8)">
        {/* Header */}
        <XStack
          height={64 + insets.top}
          backgroundColor="#2f3136"
          paddingHorizontal="$4"
          paddingTop={insets.top}
          alignItems="flex-end"
          paddingBottom="$3"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor="#202225"
        >
          <Text fontSize={isMobile ? "$5" : "$6"} fontWeight="700" color="white" numberOfLines={1} flex={1}>
            {serverName ? `${serverName} Settings` : "Server Settings"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#b9bbbe" />
          </TouchableOpacity>
        </XStack>

        {isMobile ? (
          /* Mobile: Horizontal tab bar + vertical content */
          <YStack flex={1}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} backgroundColor="#202225">
              <XStack padding="$2" gap="$2">
                {pages.map((page) => (
                  <TouchableOpacity key={page} onPress={() => setSelectedPage(page)}>
                    <YStack
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      backgroundColor={selectedPage === page ? "#5865F2" : "#2f3136"}
                      borderRadius="$3"
                    >
                      <Text color="white" fontSize="$3" numberOfLines={1}>
                        {page}
                      </Text>
                    </YStack>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={handleLeave} disabled={isOwner}>
                  <YStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    backgroundColor="#2f3136"
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor="#f04747"
                    opacity={isOwner ? 0.5 : 1}
                  >
                    <Text color="#f04747" fontSize="$3" numberOfLines={1}>
                      Leave
                    </Text>
                  </YStack>
                </TouchableOpacity>
              </XStack>
            </ScrollView>
            <ScrollView
              flex={1}
              backgroundColor="#2f3136"
              padding="$3"
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
              {renderContent()}
            </ScrollView>
          </YStack>
        ) : (
          /* Desktop: Sidebar + content */
          <XStack flex={1}>
            <YStack width={180} backgroundColor="#202225" justifyContent="space-between">
              <YStack>
                {pages.map((page) => (
                  <TouchableOpacity key={page} onPress={() => setSelectedPage(page)}>
                    <YStack
                      padding="$3"
                      backgroundColor={selectedPage === page ? "#5865F2" : "transparent"}
                      pressStyle={{
                        backgroundColor: selectedPage === page ? "#4752c4" : "#40444b",
                      }}
                    >
                      <Text color="white" fontSize="$3">
                        {page}
                      </Text>
                    </YStack>
                  </TouchableOpacity>
                ))}
              </YStack>

              <YStack padding="$3" borderTopWidth={1} borderTopColor="#292b2f">
                <Button
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#f04747"
                  onPress={handleLeave}
                  disabled={isOwner || loading}
                  opacity={isOwner ? 0.5 : 1}
                >
                  Leave Server
                </Button>
              </YStack>
            </YStack>

            <ScrollView flex={1} backgroundColor="#2f3136" padding="$4">
              {renderContent()}
            </ScrollView>
          </XStack>
        )}
      </YStack>
    </Modal>
  );
};

export default SettingsDialog;