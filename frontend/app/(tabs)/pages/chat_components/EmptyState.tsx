import React from "react";
import { YStack, Text } from "tamagui";
import { TouchableOpacity } from "react-native";
import { Menu } from "@tamagui/lucide-icons";
import { usePreferences } from "../../../../utils/PreferencesContext";

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
  const { fontFamily } = usePreferences();
  return (
    <YStack
      flex={1}
      backgroundColor="#1E1F2B"
      justifyContent="center"
      alignItems="center"
      padding="$4"
    >
      {!isDesktop && (
        <TouchableOpacity
          onPress={onOpenSidebar}
          style={{ position: "absolute", top: 20 + topInset, left: 20 }}
        >
          <Menu size={28} color="#9CA3AF" />
        </TouchableOpacity>
      )}
      <Text color="#6B7280" fontSize={isMobile ? "$5" : "$6"} fontWeight="600" textAlign="center" fontFamily={fontFamily}>
        {!hasServers && !hasConversations
          ? "Add friends or create a server to start chatting"
          : "Select a conversation to start chatting"}
      </Text>
    </YStack>
  );
};

export default React.memo(EmptyState);
