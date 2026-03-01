import React, { useState, useEffect, useCallback } from "react";
import {
  YStack,
  XStack,
  Text,
  Input,
  Button,
  Card,
  ScrollView
} from "tamagui";
import {
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  Image,
} from "react-native";
import {
  UserPlus,
  Check,
  X,
  Users,
  MessageCircle,
  Trash2,
  Clock,
  Send
} from "@tamagui/lucide-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchFriends,
  fetchFriendRequests,
  fetchPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  createOrGetConversation,
  FriendshipData
} from "../../../../utils/api";
import { useAuth } from "../../../../utils/AuthContext";
import { BASE_URL } from "../../../../utils/config";

interface FriendsListProps {
  open: boolean;
  onClose: () => void;
  onStartConversation: (conversationId: number) => void;
  refreshTrigger?: number;
}

type Tab = "friends" | "incoming" | "outgoing";

const FriendsList: React.FC<FriendsListProps> = ({
  open,
  onClose,
  onStartConversation,
  refreshTrigger = 0,
}) => {
  const { token, logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 600;

  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<FriendshipData[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendshipData[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendshipData[]>([]);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const baseUrl = BASE_URL;

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [friendsList, incoming, outgoing] = await Promise.all([
        fetchFriends(token, logout),
        fetchFriendRequests(token, logout),
        fetchPendingRequests(token, logout),
      ]);
      setFriends(friendsList);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (error) {
      console.error("Failed to load friends data:", error);
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  // Auto-refresh friend requests when modal is open
  useEffect(() => {
    if (!open || !token) return;

    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [open, token, loadData]);

  // Refresh when a WebSocket event triggers a change (e.g., new friend request)
  useEffect(() => {
    if (open && refreshTrigger > 0) {
      loadData();
    }
  }, [refreshTrigger, open, loadData]);

  const handleSendRequest = async () => {
    if (!token || !addFriendUsername.trim()) return;
    try {
      const result = await sendFriendRequest(token, addFriendUsername.trim(), logout);
      showSnackbar(result.detail || "Friend request sent!");
      setAddFriendUsername("");
      loadData();
    } catch (error: any) {
      try {
        const parsed = JSON.parse(error.message);
        showSnackbar(parsed.detail || "Failed to send friend request");
      } catch {
        showSnackbar(error.message || "Failed to send friend request");
      }
    }
  };

  const handleAccept = async (friendshipId: number) => {
    if (!token) return;
    try {
      await acceptFriendRequest(token, friendshipId, logout);
      showSnackbar("Friend request accepted!");
      loadData();
    } catch {
      showSnackbar("Failed to accept request");
    }
  };

  const handleReject = async (friendshipId: number) => {
    if (!token) return;
    try {
      await rejectFriendRequest(token, friendshipId, logout);
      showSnackbar("Friend request rejected");
      loadData();
    } catch {
      showSnackbar("Failed to reject request");
    }
  };

  const handleRemoveFriend = async (friendId: number) => {
    if (!token) return;
    try {
      await removeFriend(token, friendId, logout);
      showSnackbar("Friend removed");
      loadData();
    } catch {
      showSnackbar("Failed to remove friend");
    }
  };

  const handleStartConversation = async (friendId: number) => {
    if (!token) return;
    try {
      const convo = await createOrGetConversation(token, friendId, logout);
      onStartConversation(convo.id);
      onClose();
    } catch {
      showSnackbar("Failed to start conversation");
    }
  };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  const renderAvatar = (user: { icon_url?: string | null; username: string }, size: number = 40) => {
    if (user.icon_url) {
      return (
        <Image
          source={{ uri: `${baseUrl}${user.icon_url}` }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }
    return (
      <YStack
        width={size}
        height={size}
        borderRadius={size / 2}
        backgroundColor="#5865F2"
        justifyContent="center"
        alignItems="center"
      >
        <Text color="white" fontSize={size > 36 ? "$4" : "$3"} fontWeight="700">
          {getFirstLetter(user.username)}
        </Text>
      </YStack>
    );
  };

  const renderFriendItem = (friendship: FriendshipData) => {
    const friend = friendship.friend;
    if (!friend) return null;

    return (
      <XStack
        key={friendship.id}
        padding="$3"
        alignItems="center"
        gap="$3"
        backgroundColor="#2f3136"
        borderRadius="$3"
      >
        {renderAvatar(friend)}
        <YStack flex={1}>
          <Text color="white" fontSize="$4" fontWeight="600">
            {friend.username}
          </Text>
        </YStack>
        <XStack gap="$2">
          <TouchableOpacity onPress={() => handleStartConversation(friend.id)}>
            <YStack
              padding="$2"
              backgroundColor="#5865F2"
              borderRadius="$2"
            >
              <MessageCircle size={18} color="white" />
            </YStack>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRemoveFriend(friend.id)}>
            <YStack
              padding="$2"
              backgroundColor="#40444b"
              borderRadius="$2"
            >
              <Trash2 size={18} color="#f04747" />
            </YStack>
          </TouchableOpacity>
        </XStack>
      </XStack>
    );
  };

  const renderIncomingRequest = (friendship: FriendshipData) => {
    const sender = friendship.friend;
    if (!sender) return null;

    return (
      <XStack
        key={friendship.id}
        padding="$3"
        alignItems="center"
        gap="$3"
        backgroundColor="#2f3136"
        borderRadius="$3"
      >
        {renderAvatar(sender)}
        <YStack flex={1}>
          <Text color="white" fontSize="$4" fontWeight="600">
            {sender.username}
          </Text>
          <Text color="#72767d" fontSize="$2">
            Incoming request
          </Text>
        </YStack>
        <XStack gap="$2">
          <TouchableOpacity onPress={() => handleAccept(friendship.id)}>
            <YStack
              padding="$2"
              backgroundColor="#43b581"
              borderRadius="$2"
            >
              <Check size={18} color="white" />
            </YStack>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleReject(friendship.id)}>
            <YStack
              padding="$2"
              backgroundColor="#f04747"
              borderRadius="$2"
            >
              <X size={18} color="white" />
            </YStack>
          </TouchableOpacity>
        </XStack>
      </XStack>
    );
  };

  const renderOutgoingRequest = (friendship: FriendshipData) => {
    const target = friendship.friend;
    if (!target) return null;

    return (
      <XStack
        key={friendship.id}
        padding="$3"
        alignItems="center"
        gap="$3"
        backgroundColor="#2f3136"
        borderRadius="$3"
      >
        {renderAvatar(target)}
        <YStack flex={1}>
          <Text color="white" fontSize="$4" fontWeight="600">
            {target.username}
          </Text>
          <Text color="#72767d" fontSize="$2">
            Pending...
          </Text>
        </YStack>
        <Clock size={18} color="#72767d" />
      </XStack>
    );
  };

  const tabData: { key: Tab; label: string; count: number }[] = [
    { key: "friends", label: "Friends", count: friends.length },
    { key: "incoming", label: "Incoming", count: incomingRequests.length },
    { key: "outgoing", label: "Sent", count: outgoingRequests.length },
  ];

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
          maxWidth={550}
          height={isMobile ? "90%" : "80%"}
          maxHeight={700}
          backgroundColor="#36393f"
          borderRadius="$4"
          overflow="hidden"
        >
          {/* Header */}
          <XStack
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="#2f3136"
            borderBottomWidth={1}
            borderBottomColor="#202225"
          >
            <XStack alignItems="center" gap="$2">
              <Users size={22} color="#5865F2" />
              <Text fontSize="$6" fontWeight="700" color="white">
                Friends
              </Text>
            </XStack>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#b9bbbe" />
            </TouchableOpacity>
          </XStack>

          {/* Add Friend Section */}
          <YStack padding="$3" gap="$2" borderBottomWidth={1} borderBottomColor="#202225">
            <Text fontSize="$3" fontWeight="600" color="#b9bbbe">
              Add Friend
            </Text>
            <XStack gap="$2" alignItems="center">
              <Input
                flex={1}
                placeholder="Enter username"
                value={addFriendUsername}
                onChangeText={setAddFriendUsername}
                backgroundColor="#40444b"
                borderWidth={0}
                color="white"
                fontSize="$3"
                padding="$2"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSendRequest}
              />
              <Button
                size="$3"
                backgroundColor="#5865F2"
                onPress={handleSendRequest}
                disabled={!addFriendUsername.trim()}
                disabledStyle={{ opacity: 0.5 }}
                pressStyle={{ backgroundColor: "#4752C4" }}
                icon={<Send size={16} color="white" />}
              >
                Send
              </Button>
            </XStack>
          </YStack>

          {/* Tabs */}
          <XStack
            backgroundColor="#2f3136"
            borderBottomWidth={1}
            borderBottomColor="#202225"
          >
            {tabData.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{ flex: 1 }}
              >
                <YStack
                  padding="$3"
                  alignItems="center"
                  borderBottomWidth={2}
                  borderBottomColor={activeTab === tab.key ? "#5865F2" : "transparent"}
                >
                  <XStack gap="$1" alignItems="center">
                    <Text
                      color={activeTab === tab.key ? "white" : "#72767d"}
                      fontSize="$3"
                      fontWeight="600"
                    >
                      {tab.label}
                    </Text>
                    {tab.count > 0 && (
                      <YStack
                        backgroundColor={activeTab === tab.key ? "#5865F2" : "#40444b"}
                        borderRadius={10}
                        paddingHorizontal="$1.5"
                        marginLeft="$1"
                        minWidth={20}
                        alignItems="center"
                      >
                        <Text color="white" fontSize="$1" fontWeight="700">
                          {tab.count}
                        </Text>
                      </YStack>
                    )}
                  </XStack>
                </YStack>
              </TouchableOpacity>
            ))}
          </XStack>

          {/* Content */}
          <ScrollView flex={1}>
            <YStack padding="$3" gap="$2">
              {activeTab === "friends" && (
                <>
                  {friends.length === 0 ? (
                    <YStack padding="$6" alignItems="center">
                      <Users size={48} color="#40444b" />
                      <Text color="#72767d" fontSize="$4" marginTop="$3" textAlign="center">
                        No friends yet. Add someone by their username!
                      </Text>
                    </YStack>
                  ) : (
                    friends.map(renderFriendItem)
                  )}
                </>
              )}

              {activeTab === "incoming" && (
                <>
                  {incomingRequests.length === 0 ? (
                    <YStack padding="$6" alignItems="center">
                      <UserPlus size={48} color="#40444b" />
                      <Text color="#72767d" fontSize="$4" marginTop="$3" textAlign="center">
                        No incoming friend requests
                      </Text>
                    </YStack>
                  ) : (
                    incomingRequests.map(renderIncomingRequest)
                  )}
                </>
              )}

              {activeTab === "outgoing" && (
                <>
                  {outgoingRequests.length === 0 ? (
                    <YStack padding="$6" alignItems="center">
                      <Clock size={48} color="#40444b" />
                      <Text color="#72767d" fontSize="$4" marginTop="$3" textAlign="center">
                        No pending friend requests
                      </Text>
                    </YStack>
                  ) : (
                    outgoingRequests.map(renderOutgoingRequest)
                  )}
                </>
              )}
            </YStack>
          </ScrollView>
        </Card>
      </YStack>

      {/* Snackbar */}
      {snackbarVisible && (
        <Card
          position="absolute"
          bottom={insets.bottom + 20}
          alignSelf="center"
          backgroundColor="#323232"
          padding="$3"
          borderRadius="$4"
          marginHorizontal="$4"
          maxWidth={400}
          shadowColor="black"
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={0.3}
          shadowRadius={8}
        >
          <Text color="white" fontSize="$3">{snackbarMessage}</Text>
        </Card>
      )}
    </Modal>
  );
};

export default FriendsList;
