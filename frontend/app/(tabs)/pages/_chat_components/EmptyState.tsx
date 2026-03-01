import React from "react";
import { YStack, Text } from "tamagui";
import { TouchableOpacity } from "react-native";
import { Menu } from "@tamagui/lucide-icons";

interface EmptyStateProps {
  isDesktop: boolean;
  isMobile: boolean;
  topInset: number;
  hasServers: boolean;
  hasConversations: boolean;
  onOpenSidebar: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  isDesktop,
  isMobile,
  topInset,
  hasServers,
  hasConversations,
  onOpenSidebar,
}) => {
  return (
    <YStack
      flex={1}
      backgroundColor="#36393f"
      justifyContent="center"
      alignItems="center"
      padding="$4"
    >
      {!isDesktop && (
        <TouchableOpacity
          onPress={onOpenSidebar}
          style={{ position: "absolute", top: 20 + topInset, left: 20 }}
        >
          <Menu size={28} color="#b9bbbe" />
        </TouchableOpacity>
      )}
      <Text color="#72767d" fontSize={isMobile ? "$5" : "$6"} fontWeight="600" textAlign="center">
        {!hasServers && !hasConversations
          ? "Add friends or create a server to start chatting"
          : "Select a conversation to start chatting"}
      </Text>
    </YStack>
  );
};

export default React.memo(EmptyState);
