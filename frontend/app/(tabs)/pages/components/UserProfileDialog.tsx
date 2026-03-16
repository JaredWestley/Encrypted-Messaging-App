import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Spinner, Separator } from "tamagui";
import { Modal, TouchableOpacity, Image } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { fetchUsersInServer, fetchCurrentUser } from "../../../../utils/api";
import { usePreferences } from "../../../../utils/PreferencesContext";
import { BASE_URL } from "../../../../utils/config";

interface User {
  id: number;
  username: string;
}

interface ServerUser {
  id: number;
  username: string;
  icon_url: string | null;
  bio?: string;
}

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface ConversationMember {
  id: number;
  username: string;
  icon_url?: string;
  created_at: string;
}

interface ActiveConversation {
  id: number;
  name?: string;
  is_group: boolean;
  created_at: string;
  members: ConversationMember[];
}

interface UserProfileDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  currentUserId: number;
  selectedServer: Server | null;
  token: string;
  logout: () => void;
  isDmMode?: boolean;
  activeConversation?: ActiveConversation | null;
}

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  open,
  user,
  onClose,
  selectedServer,
  token,
  logout,
  isDmMode = false,
  activeConversation = null,
}) => {
  const { fontFamily } = usePreferences();
  const serverId = selectedServer?.id ?? 0;
  const [detailedUser, setDetailedUser] = useState<ServerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user || !token) {
      setDetailedUser(null);
      setLoading(true);
      return;
    }

    // In DM mode, get user icon from conversation members
    if (isDmMode && activeConversation) {
      const member = activeConversation.members.find((m) => m.id === user.id);
      if (member) {
        setDetailedUser({
          id: member.id,
          username: member.username,
          icon_url: member.icon_url ?? null,
        });
      } else {
        setDetailedUser({ ...user, icon_url: null });
      }
      setLoading(false);
      return;
    }

    // In server mode, fetch from server users endpoint
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
  }, [open, user, token, serverId, logout, isDmMode, activeConversation]);

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
          backgroundColor="#171823"
          borderRadius="$4"
          overflow="hidden"
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            backgroundColor="#171823"
            alignItems="center"
            justifyContent="space-between"
          >
            <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
              User Profile
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </XStack>

          {/* Content */}
          <YStack backgroundColor="#1E1F2B" padding="$4">
            {loading ? (
              <YStack paddingVertical="$8" alignItems="center">
                <Spinner color="white" size="large" />
              </YStack>
            ) : (
              <>
                {/* User Info */}
                <XStack alignItems="center">
                  {displayUser.icon_url ? (
                    <Image
                      source={{ uri: `${BASE_URL}${displayUser.icon_url}` }}
                      style={{ width: 80, height: 80, borderRadius: 40 }}
                    />
                  ) : (
                    <YStack
                      width={80}
                      height={80}
                      borderRadius={40}
                      backgroundColor="#0EA5E9"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Text color="white" fontSize="$9" fontWeight="700" fontFamily={fontFamily}>
                        {getFirstLetter(displayUser.username)}
                      </Text>
                    </YStack>
                  )}
                  <YStack flex={1} paddingLeft={8}>
                    <Text fontSize="$7" fontWeight="700" color="white" fontFamily={fontFamily}>
                      {displayUser.username}
                    </Text>
                    <Text fontSize="$3" color="#9CA3AF" marginTop="$1" fontFamily={fontFamily}>
                      User ID: {displayUser.id}
                    </Text>
                  </YStack>
                </XStack>

                {/* Divider */}
                <Separator borderColor="#2D2E3F" marginVertical="$2" />

                {/* Bio Section */}
                <YStack paddingTop={4}>
                  <Text
                    fontSize="$2"
                    fontWeight="700"
                    color="#9CA3AF"
                    textTransform="uppercase"
                    letterSpacing={1}
                    fontFamily={fontFamily}
                  >
                    About
                  </Text>
                  <Text fontSize="$3" color="#D1D5DB" lineHeight={20} paddingTop={4} fontFamily={fontFamily}>
                    {displayUser.bio || "No bio set"}
                  </Text>
                </YStack>

                {/* Close Button */}
                <Button
                  backgroundColor="#0EA5E9"
                  onPress={onClose}
                  marginTop="$3"
                  pressStyle={{
                    backgroundColor: "#0284C7",
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