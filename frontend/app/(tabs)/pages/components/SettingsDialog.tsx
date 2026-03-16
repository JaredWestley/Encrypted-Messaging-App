import React, { useState, useEffect, useMemo } from "react";
import { YStack, XStack, Text, Button, Input, ScrollView, Card } from "tamagui";
import { Modal, TouchableOpacity, Alert as RNAlert, useWindowDimensions, Platform } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { leaveServer, generateInviteLink, fetchUserRoles } from "../../../../utils/api";
import RolesSettings from "./RolesSettings";
import AdminPanel from "./AdminPanel";
import ServerSettings from "./ServerSettings";
import InviteList from "./InviteList";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from "../../../../utils/PreferencesContext";

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
  slow_mode_seconds?: number;
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
  const { fontSizeValue, fontFamily } = usePreferences();
  const serverId = selectedServer?.id ?? 0;
  const serverName = selectedServer?.name;
  const selectedServerOwnerId = selectedServer?.owner_id ?? 0;
  const isOwner = userId === selectedServerOwnerId;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [selectedPage, setSelectedPage] = useState<"Admin" | "Invite" | "Roles" | "Server Settings">("Invite");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteRefreshCounter, setInviteRefreshCounter] = useState(0);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  // Fetch user's permissions for this server
  useEffect(() => {
    if (!open || !token || !serverId || !userId) return;
    fetchUserRoles(token, serverId, userId, logout)
      .then((roles) => {
        const perms = roles.flatMap((role: any) => role.permissions || []);
        setUserPermissions(perms);
      })
      .catch(() => setUserPermissions([]));
  }, [open, token, serverId, userId, logout]);

  // Determine which tabs are visible based on permissions
  const visiblePages = useMemo(() => {
    const pages: ("Admin" | "Invite" | "Roles" | "Server Settings")[] = [];

    // Admin: owner or has KICK_MEMBERS or BAN_MEMBERS
    if (isOwner || userPermissions.includes("KICK_MEMBERS") || userPermissions.includes("BAN_MEMBERS")) {
      pages.push("Admin");
    }

    // Invite: all members can invite
    pages.push("Invite");

    // Roles: owner or has MANAGE_ROLES
    if (isOwner || userPermissions.includes("MANAGE_ROLES")) {
      pages.push("Roles");
    }

    // Server Settings: owner or has MANAGE_SERVER
    if (isOwner || userPermissions.includes("MANAGE_SERVER")) {
      pages.push("Server Settings");
    }

    return pages;
  }, [isOwner, userPermissions]);

  // Reset selected page if it's no longer visible
  useEffect(() => {
    if (visiblePages.length > 0 && !visiblePages.includes(selectedPage)) {
      setSelectedPage(visiblePages[0]);
    }
  }, [visiblePages, selectedPage]);

  const handleLeave = async () => {
    if (isOwner) {
      if (Platform.OS === "web") {
        window.alert("You are the owner and cannot leave your own server.");
      } else {
        RNAlert.alert("Cannot Leave", "You are the owner and cannot leave your own server");
      }
      return;
    }

    const doLeave = async () => {
      try {
        setLoading(true);
        await leaveServer(token, serverId, logout);
        setDidLeaveServer(true);
        onClose();
      } catch (err: any) {
        if (Platform.OS === "web") {
          window.alert(err.message || "Failed to leave server");
        } else {
          RNAlert.alert("Error", err.message || "Failed to leave server");
        }
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to leave this server?")) {
        await doLeave();
      }
    } else {
      RNAlert.alert(
        "Leave Server",
        "Are you sure you want to leave this server?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Leave", style: "destructive", onPress: doLeave },
        ]
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for older browsers
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        return true;
      }
    } catch {
      // Copy failed
    }
    return false;
  };

  const handleGenerateInvite = async () => {
    try {
      setLoading(true);
      const res = await generateInviteLink(token, serverId, logout);
      setInviteLink(res.token);
      setInviteRefreshCounter((prev) => prev + 1);
      // Auto-copy to clipboard on generation
      const copied = await copyToClipboard(res.token);
      if (Platform.OS === "web") {
        showSnackbar(copied ? "Invite token generated and copied to clipboard!" : "Invite token generated! Copy it manually.");
      } else {
        RNAlert.alert("Success", copied ? "Invite token generated and copied to clipboard!" : "Invite token generated!");
      }
    } catch (err: any) {
      if (Platform.OS === "web") {
        window.alert(err.message || "Failed to generate invite");
      } else {
        RNAlert.alert("Error", err.message || "Failed to generate invite");
      }
    } finally {
      setLoading(false);
    }
  };

  const pages = visiblePages;

  // Whether the current page needs its own flex layout (not wrapped in ScrollView)
  const isFlexPage = selectedPage === "Roles";

  const renderScrollableContent = () => (
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
        <YStack gap="$3">
          <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
            Invite People to Server
          </Text>

          <Button
            backgroundColor="#0EA5E9"
            onPress={handleGenerateInvite}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Invite Link"}
          </Button>

          {inviteLink && (
            <YStack marginTop="$2">
              <Text fontSize="$3" color="#9CA3AF" marginBottom="$4" fontFamily={fontFamily}>
                Newly generated invite token:
              </Text>
              <Card backgroundColor="#1E1F2B" padding="$3" borderRadius="$3">
                <XStack justifyContent="space-between" alignItems="center" gap="$2">
                  <Text color="white" fontSize="$3" flex={1} selectable fontFamily={fontFamily}>
                    {inviteLink}
                  </Text>
                  <Button
                    size="$3"
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="#0EA5E9"
                    onPress={async () => {
                      const copied = await copyToClipboard(inviteLink);
                      if (Platform.OS === "web") {
                        showSnackbar(copied ? "Invite token copied to clipboard!" : "Could not copy automatically. Please select and copy the token manually.");
                      } else {
                        RNAlert.alert(
                          copied ? "Copied" : "Info",
                          copied ? "Invite token copied to clipboard" : "Select and copy the token manually"
                        );
                      }
                    }}
                  >
                    Copy
                  </Button>
                </XStack>
              </Card>
            </YStack>
          )}

          <YStack marginTop="$4">
            <Text fontSize="$5" fontWeight="600" color="white" marginBottom="$4" fontFamily={fontFamily}>
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

      {selectedPage === "Server Settings" && (
        <ServerSettings
          serverId={serverId}
          token={token}
          logout={logout}
          currentIcon={selectedServer?.icon_url}
          currentName={serverName || ""}
          isOwner={isOwner}
          onServerRenamed={(newName) => {
            // Update the server name in the servers list and selected server
            setServers((prev) =>
              prev.map((s) => (s.id === serverId ? { ...s, name: newName } : s))
            );
            if (selectedServer && selectedServer.id === serverId) {
              setSelectedServer({ ...selectedServer, name: newName });
            }
          }}
          onServerIconUpdated={(newIconUrl) => {
            // Append cache-buster to force image refresh
            const cacheBusted = `${newIconUrl}?t=${Date.now()}`;
            // Update the server icon in the servers list and selected server
            setServers((prev) =>
              prev.map((s) => (s.id === serverId ? { ...s, icon_url: cacheBusted } : s))
            );
            if (selectedServer && selectedServer.id === serverId) {
              setSelectedServer({ ...selectedServer, icon_url: cacheBusted });
            }
          }}
          onServerDeleted={() => {
            setDidLeaveServer(true);
            onClose();
          }}
          currentSlowMode={selectedServer?.slow_mode_seconds ?? 0}
          onSlowModeChanged={(seconds) => {
            setServers((prev) =>
              prev.map((s) => (s.id === serverId ? { ...s, slow_mode_seconds: seconds } : s))
            );
            if (selectedServer && selectedServer.id === serverId) {
              setSelectedServer({ ...selectedServer, slow_mode_seconds: seconds });
            }
          }}
        />
      )}
    </>
  );

  const renderFlexContent = () => (
    <>
      {selectedPage === "Roles" && (
        <RolesSettings serverId={serverId} token={token} logout={logout} />
      )}
    </>
  );

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <YStack flex={1} backgroundColor="#1e1f22">
        {/* Header */}
        <XStack
          height={64 + insets.top}
          backgroundColor="#171823"
          paddingHorizontal="$4"
          paddingTop={insets.top}
          alignItems="flex-end"
          paddingBottom="$3"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor="#2D2E3F"
        >
          <Text fontSize={isMobile ? "$5" : "$6"} fontWeight="700" color="white" numberOfLines={1} flex={1} fontFamily={fontFamily}>
            {serverName ? `${serverName} Settings` : "Server Settings"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </XStack>

        {isMobile ? (
          /* Mobile: Horizontal tab bar + vertical content */
          <YStack flex={1} backgroundColor="#171823">
            <XStack
              backgroundColor="#2D2E3F"
              paddingHorizontal="$2"
              paddingVertical="$2"
              gap="$2"
              flexWrap="wrap"
            >
              {pages.map((page) => (
                <TouchableOpacity key={page} onPress={() => setSelectedPage(page)}>
                  <YStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    backgroundColor={selectedPage === page ? "#0EA5E9" : "#171823"}
                    borderRadius="$3"
                  >
                    <Text color="white" fontSize="$3" numberOfLines={1} fontFamily={fontFamily}>
                      {page}
                    </Text>
                  </YStack>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={handleLeave} disabled={isOwner}>
                <YStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor="#171823"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="#EF4444"
                  opacity={isOwner ? 0.5 : 1}
                >
                  <Text color="#EF4444" fontSize="$3" numberOfLines={1} fontFamily={fontFamily}>
                    Leave
                  </Text>
                </YStack>
              </TouchableOpacity>
            </XStack>
            {isFlexPage ? (
              <YStack flex={1}>
                {renderFlexContent()}
              </YStack>
            ) : (
              <ScrollView
                flex={1}
                backgroundColor="#171823"
                padding="$3"
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              >
                {renderScrollableContent()}
              </ScrollView>
            )}
          </YStack>
        ) : (
          /* Desktop: Sidebar + content */
          <XStack flex={1}>
            <YStack width={180} backgroundColor="#2D2E3F" justifyContent="space-between">
              <YStack>
                {pages.map((page) => (
                  <TouchableOpacity key={page} onPress={() => setSelectedPage(page)}>
                    <YStack
                      padding="$3"
                      backgroundColor={selectedPage === page ? "#0EA5E9" : "transparent"}
                      pressStyle={{
                        backgroundColor: selectedPage === page ? "#0284C7" : "#2D2E3F",
                      }}
                    >
                      <Text color="white" fontSize="$3" fontFamily={fontFamily}>
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
                  borderColor="#EF4444"
                  onPress={handleLeave}
                  disabled={isOwner || loading}
                  opacity={isOwner ? 0.5 : 1}
                >
                  Leave Server
                </Button>
              </YStack>
            </YStack>

            {isFlexPage ? (
              <YStack flex={1} backgroundColor="#171823">
                {renderFlexContent()}
              </YStack>
            ) : (
              <ScrollView flex={1} backgroundColor="#171823" padding="$4">
                {renderScrollableContent()}
              </ScrollView>
            )}
          </XStack>
        )}
      </YStack>
      {/* Snackbar */}
      {snackbarVisible && (
        <Card
              position="absolute"
              top={insets.top + 20}
              alignSelf="center"
              backgroundColor="#252636"
              padding={isMobile ? "$4" : "$3"}
              borderRadius="$4"
              marginHorizontal="$4"
              maxWidth={isMobile ? "90%" : 400}
              shadowColor="black"
              shadowOffset={{ width: 0, height: 4 }}
              shadowOpacity={0.3}
              shadowRadius={8}
            >
          <Text color="white" fontSize="$3" fontFamily={fontFamily}>{snackbarMessage}</Text>
        </Card>
      )}
    </Modal>
  );
};

export default SettingsDialog;