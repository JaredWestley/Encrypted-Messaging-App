import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Avatar, Spinner, Separator } from "tamagui";
import { Modal, TouchableOpacity, Image } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { fetchUsersInServer } from "../../utils/api";

interface User {
  id: number;
  username: string;
}

interface ServerUser {
  id: number;
  username: string;
  icon_url: string | null;
}

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface UserProfileDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  currentUserId: number;
  selectedServer: Server | null;
  token: string;
  logout: () => void;
}

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  open,
  user,
  onClose,
  currentUserId,
  selectedServer,
  token,
  logout,
}) => {
  const serverId = selectedServer?.id ?? 0;
  const [detailedUser, setDetailedUser] = useState<ServerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user || !token) {
      setDetailedUser(null);
      setLoading(true);
      return;
    }

    const loadUserDetails = async () => {
      try {
        setLoading(true);
        const users = await fetchUsersInServer(token, serverId, logout);
        const matchedUser = users.find((u) => u.id === user.id) || null;
        setDetailedUser(matchedUser);
      } catch (err) {
        console.error("Failed to fetch user details:", err);
        setDetailedUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUserDetails();
  }, [open, user, token, serverId, logout]);

  if (!user) return null;

  const displayUser = detailedUser || { ...user, icon_url: null };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <YStack
        flex={1}
        backgroundColor="rgba(0,0,0,0.7)"
        justifyContent="center"
        alignItems="center"
        padding="$4"
      >
        <YStack
          width="90%"
          maxWidth={400}
          backgroundColor="#2f3136"
          borderRadius="$4"
          overflow="hidden"
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            backgroundColor="#2f3136"
            alignItems="center"
            justifyContent="space-between"
          >
            <Text fontSize="$6" fontWeight="700" color="white">
              User Profile
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#b9bbbe" />
            </TouchableOpacity>
          </XStack>

          {/* Content */}
          <YStack backgroundColor="#36393f" padding="$4">
            {loading ? (
              <YStack paddingVertical="$8" alignItems="center">
                <Spinner color="white" size="large" />
              </YStack>
            ) : (
              <>
                {/* User Info */}
                <XStack alignItems="center" marginTop="$2">
                  {displayUser.icon_url ? (
                    <Image
                      source={{ uri: `http://localhost:8000${displayUser.icon_url}` }}
                      style={{ width: 80, height: 80, borderRadius: 40 }}
                    />
                  ) : (
                    <Avatar circular size="$10" backgroundColor="#5865F2">
                      <Avatar.Fallback backgroundColor="#5865F2">
                        <Text color="white" fontSize="$9" fontWeight="700">
                          {getFirstLetter(displayUser.username)}
                        </Text>
                      </Avatar.Fallback>
                    </Avatar>
                  )}
                  <YStack flex={1}>
                    <Text fontSize="$7" fontWeight="700" color="white">
                      {displayUser.username}
                    </Text>
                    <Text fontSize="$3" color="#b9bbbe" marginTop="$1">
                      User ID: {displayUser.id}
                    </Text>
                  </YStack>
                </XStack>

                {/* Divider */}
                <Separator borderColor="#202225" marginVertical="$2" />

                {/* About Section */}
                <YStack>
                  <Text
                    fontSize="$2"
                    fontWeight="700"
                    color="#b9bbbe"
                    textTransform="uppercase"
                    letterSpacing={1}
                  >
                    About
                  </Text>
                  <Text fontSize="$3" color="#dcddde" lineHeight={20}>
                    This is a placeholder for more user information, such as bio, roles, or
                    recent activity.
                  </Text>
                </YStack>

                {/* Close Button */}
                <Button
                  backgroundColor="#5865F2"
                  onPress={onClose}
                  marginTop="$3"
                  pressStyle={{
                    backgroundColor: "#4752c4",
                  }}
                >
                  Close
                </Button>
              </>
            )}
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
};

export default UserProfileDialog;