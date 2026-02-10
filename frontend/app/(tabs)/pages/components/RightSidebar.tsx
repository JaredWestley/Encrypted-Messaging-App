import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, ScrollView, Spinner, Avatar } from "tamagui";
import { TouchableOpacity, Image } from "react-native";
import { X } from "@tamagui/lucide-icons";
import { fetchUsersInServer } from "../../utils/api";

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
  userId,
  onUserClick,
  onClose,
  logout,
}) => {
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
    <YStack width={240} backgroundColor="#2f3136" borderLeftWidth={1} borderLeftColor="#202225" height="100%">
      {/* Header */}
      <XStack
        height={64}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor="#202225"
        backgroundColor="#2f3136"
      >
        <Text fontSize="$4" color="white" fontWeight="600">
          {error ? "Users (?)" : `Users (${users.length})`}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <X size={20} color="#b9bbbe" />
        </TouchableOpacity>
      </XStack>

      {/* User List */}
      {loading ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner color="white" size="large" />
        </YStack>
      ) : error ? (
        <YStack padding="$3">
          <Text color="#ff5555" fontSize="$3">
            {error}
          </Text>
        </YStack>
      ) : users.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Text color="#b9bbbe" fontSize="$3">
            No users found
          </Text>
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$2">
            {users.map((user) => (
              <TouchableOpacity key={user.id} onPress={() => onUserClick(user)}>
                <XStack
                  paddingVertical="$2"
                  paddingHorizontal="$2"
                  borderRadius="$2"
                  alignItems="center"
                  gap="$2"
                  pressStyle={{
                    backgroundColor: "#40444b",
                  }}
                >
                  {user.icon_url ? (
                    <Image
                      source={{ uri: `http://localhost:8000${user.icon_url}` }}
                      style={{ width: 32, height: 32, borderRadius: 16 }}
                    />
                  ) : (
                    <Avatar circular size="$3" backgroundColor="#757575">
                      <Avatar.Fallback backgroundColor="#757575">
                        <Text color="white" fontSize="$3" fontWeight="600">
                          {getFirstLetter(user.username)}
                        </Text>
                      </Avatar.Fallback>
                    </Avatar>
                  )}
                  <Text
                    color="#b9bbbe"
                    fontSize="$3"
                    flex={1}
                    numberOfLines={1}
                  >
                    {user.username}
                  </Text>
                </XStack>
              </TouchableOpacity>
            ))}
          </YStack>
        </ScrollView>
      )}
    </YStack>
  );
};

export default RightSidebar;