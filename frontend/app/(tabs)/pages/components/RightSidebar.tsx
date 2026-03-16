import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, ScrollView, Spinner, Separator } from "tamagui";
import { TouchableOpacity, Image, View } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { fetchUsersInServer } from "../../../../utils/api";
import { BASE_URL } from "../../../../utils/config";
import StatusIndicator from "./StatusIndicator";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface User {
  id: number;
  username: string;
  icon_url: string;
}

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface RightSidebarProps {
  selectedServer: Server;
  token: string;
  userId: number;
  onUserClick: (user: User) => void;
  onClose: () => void;
  logout: () => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  selectedServer,
  token,
  onUserClick,
  onClose,
  logout,
}) => {
  const { fontSizeValue, fontFamily } = usePreferences();
  const serverId = selectedServer.id;
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serverId || !token) {
      setUsers([]);
      setError("Unable to load users: no server selected.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    const loadUsers = async () => {
      try {
        const fetchedUsers = await fetchUsersInServer(token, serverId, logout);
        setUsers(fetchedUsers);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        setError("Unable to load users.");
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [serverId, token, logout]);

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <YStack width={240} backgroundColor="#171823" borderLeftWidth={1} borderLeftColor="#2D2E3F" height="100%">
      {/* Header */}
      <XStack
        height={64}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor="#2D2E3F"
        backgroundColor="#171823"
      >
        <Text fontSize="$4" color="white" fontWeight="600" fontFamily={fontFamily}>
          {error ? "Users (?)" : `Users (${users.length})`}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <X size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </XStack>

      {/* User List */}
      {loading ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner color="white" size="large" />
        </YStack>
      ) : error ? (
        <YStack padding="$3">
          <Text color="#EF4444" fontSize="$3" fontFamily={fontFamily}>
            {error}
          </Text>
        </YStack>
      ) : users.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Text color="#9CA3AF" fontSize="$3" fontFamily={fontFamily}>
            No users found
          </Text>
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$2">
            {users.map((user) => (
              <YStack>
                <TouchableOpacity key={user.id} onPress={() => onUserClick(user)}>
                  <XStack
                    paddingVertical="$2"
                    paddingHorizontal="$2"
                    borderRadius="$2"
                    alignItems="center"
                    gap="$2"
                    pressStyle={{
                      backgroundColor: "#2D2E3F",
                    }}
                  >
                    <View style={{ position: "relative" }}>
                      {user.icon_url ? (
                        <Image
                          source={{ uri: `${BASE_URL}${user.icon_url}` }}
                          style={{ width: 32, height: 32, borderRadius: 16 }}
                        />
                      ) : (
                        <YStack
                          width={32}
                          height={32}
                          borderRadius={16}
                          backgroundColor="#6B7280"
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Text color="white" fontSize="$2" fontWeight="600" fontFamily={fontFamily}>
                            {getFirstLetter(user.username)}
                          </Text>
                        </YStack>
                      )}
                      <View style={{ position: "absolute", bottom: -2, right: -2 }}>
                        <StatusIndicator status="online" size={14} />
                      </View>
                    </View>
                    <Text
                      color="#9CA3AF"
                      fontSize="$3"
                      flex={1}
                      numberOfLines={1}
                      fontFamily={fontFamily}
                    >
                      {user.username}
                    </Text>
                  </XStack>
                </TouchableOpacity>
                <Separator backgroundColor="#5b5f66" marginBottom="$2" marginTop={"$2"}/>
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      )}
    </YStack>
  );
};

export default RightSidebar;