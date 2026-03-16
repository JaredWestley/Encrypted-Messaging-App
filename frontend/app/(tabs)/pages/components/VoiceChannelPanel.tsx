import React, { useState, useEffect, useCallback } from "react";
import { YStack, XStack, Text, Button, Input, Separator } from "tamagui";
import { TouchableOpacity, useWindowDimensions } from "react-native";
import { Mic, MicOff, PhoneOff, Volume2, Plus } from "@tamagui/lucide-icons";
import { fetchVoiceChannels, createVoiceChannel, deleteVoiceChannel, VoiceChannelData } from "../../../../utils/api";
import { usePreferences } from "../../../../utils/PreferencesContext";
import type { VoiceChannelState } from "../../../../utils/useVoiceChannel";

interface VoiceChannelPanelProps {
  token: string;
  serverId: number;
  userId: number;
  logout: () => void;
  voiceState: VoiceChannelState;
  onJoinChannel: (channelId: number) => void;
  onLeaveChannel: () => void;
  onToggleMute: () => void;
}

const VoiceChannelPanel: React.FC<VoiceChannelPanelProps> = ({
  token,
  serverId,
  userId,
  logout,
  voiceState,
  onJoinChannel,
  onLeaveChannel,
  onToggleMute,
}) => {
  const { fontFamily } = usePreferences();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const [channels, setChannels] = useState<VoiceChannelData[]>([]);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  const loadChannels = useCallback(async () => {
    try {
      const data = await fetchVoiceChannels(token, serverId, logout);
      setChannels(data);
    } catch {
      // Silently fail
    }
  }, [token, serverId, logout]);

  useEffect(() => {
    loadChannels();
    // Poll for voice channel updates every 10 seconds
    const interval = setInterval(loadChannels, 10000);
    return () => clearInterval(interval);
  }, [loadChannels]);

  // Also refresh when voice state changes (someone joins/leaves)
  useEffect(() => {
    loadChannels();
  }, [voiceState.users.length]);

  const handleCreateChannel = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    try {
      await createVoiceChannel(token, serverId, name, 8, logout);
      setNewChannelName("");
      setShowCreateInput(false);
      loadChannels();
    } catch {
      // Silently fail
    }
  };

  const handleDeleteChannel = async (channelId: number) => {
    try {
      await deleteVoiceChannel(token, channelId, logout);
      loadChannels();
    } catch {
      // Silently fail
    }
  };

  const isInChannel = voiceState.isConnected && voiceState.channelId !== null;

  return (
    <YStack>
      <Separator borderColor="#2D2E3F" />

      {/* Section Header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        justifyContent="space-between"
      >
        <XStack alignItems="center" gap="$2">
          <Volume2 size={14} color="#8e9297" />
          <Text color="#8e9297" fontSize="$1" fontWeight="700" textTransform="uppercase" fontFamily={fontFamily}>
            Voice Channels
          </Text>
        </XStack>
        <TouchableOpacity onPress={() => setShowCreateInput(!showCreateInput)}>
          <Plus size={16} color="#8e9297" />
        </TouchableOpacity>
      </XStack>

      {/* Create channel input */}
      {showCreateInput && (
        <XStack paddingHorizontal="$3" paddingBottom="$2" gap="$2" alignItems="center">
          <Input
            flex={1}
            size="$2"
            backgroundColor="#2D2E3F"
            borderWidth={0}
            color="#D1D5DB"
            placeholder="Channel name"
            //@ts-ignore
            placeholderTextColor="#6B7280"
            value={newChannelName}
            onChangeText={setNewChannelName}
            onSubmitEditing={handleCreateChannel}
            fontFamily={fontFamily}
          />
          <Button
            size="$2"
            backgroundColor="#10B981"
            onPress={handleCreateChannel}
            pressStyle={{ backgroundColor: "#3ca374" }}
          >
            <Text color="white" fontSize="$2" fontWeight="600" fontFamily={fontFamily}>Add</Text>
          </Button>
        </XStack>
      )}

      {/* Channel List */}
      {channels.map((channel) => {
        const isCurrentChannel = isInChannel && voiceState.channelId === channel.id;
        // Merge REST connected_users with live WS voice state for the active channel
        const displayUsers: Array<{ id?: number; user_id?: number; username: string }> = isCurrentChannel
          ? voiceState.users
          : channel.connected_users;

        return (
          <YStack key={channel.id}>
            <TouchableOpacity
              onPress={() => {
                if (isCurrentChannel) return; // Already in this channel
                if (isInChannel) onLeaveChannel(); // Leave current channel first
                onJoinChannel(channel.id);
              }}
              activeOpacity={0.7}
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignItems="center"
                gap="$2"
                backgroundColor={isCurrentChannel ? "rgba(88,101,242,0.15)" : "transparent"}
                hoverStyle={{ backgroundColor: "rgba(79,84,92,0.3)" }}
                borderRadius="$2"
                marginHorizontal="$2"
              >
                <Volume2 size={16} color={isCurrentChannel ? "#10B981" : "#8e9297"} />
                <Text
                  color={isCurrentChannel ? "white" : "#8e9297"}
                  fontSize="$3"
                  flex={1}
                  numberOfLines={1}
                  fontFamily={fontFamily}
                >
                  {channel.name}
                </Text>
                <Text color="#6B7280" fontSize="$1" fontFamily={fontFamily}>
                  {displayUsers.length}/{channel.user_limit}
                </Text>
              </XStack>
            </TouchableOpacity>

            {/* Connected users */}
            {displayUsers.length > 0 && (
              <YStack paddingLeft="$6" paddingBottom="$1">
                {displayUsers.map((user) => {
                  const uid = (user as any).user_id ?? (user as any).id;
                  return (
                    <XStack
                      key={uid}
                      paddingVertical={2}
                      paddingHorizontal="$2"
                      alignItems="center"
                      gap="$2"
                    >
                      <YStack
                        width={20}
                        height={20}
                        borderRadius={10}
                        backgroundColor="#0EA5E9"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="white" fontSize={10} fontWeight="700" fontFamily={fontFamily}>
                          {user.username.charAt(0).toUpperCase()}
                        </Text>
                      </YStack>
                      <Text color="#9CA3AF" fontSize="$2" numberOfLines={1} fontFamily={fontFamily}>
                        {user.username}
                        {uid === userId ? " (you)" : ""}
                      </Text>
                    </XStack>
                  );
                })}
              </YStack>
            )}
          </YStack>
        );
      })}

      {/* Connected Controls Bar */}
      {isInChannel && (
        <XStack
          backgroundColor="#292b2f"
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          gap="$2"
          marginTop="$2"
          borderTopWidth={1}
          borderTopColor="#2D2E3F"
        >
          <YStack flex={1}>
            <Text color="#10B981" fontSize="$2" fontWeight="600" fontFamily={fontFamily}>
              Voice Connected
            </Text>
            <Text color="#8e9297" fontSize="$1" fontFamily={fontFamily}>
              {channels.find((c) => c.id === voiceState.channelId)?.name ?? ""}
            </Text>
          </YStack>
          <TouchableOpacity onPress={onToggleMute}>
            {voiceState.isMuted ? (
              <MicOff size={18} color="#EF4444" />
            ) : (
              <Mic size={18} color="#9CA3AF" />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onLeaveChannel}>
            <PhoneOff size={18} color="#EF4444" />
          </TouchableOpacity>
        </XStack>
      )}
    </YStack>
  );
};

export default VoiceChannelPanel;
