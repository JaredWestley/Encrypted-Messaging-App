import React from "react";
import { XStack, YStack, Text, Button } from "tamagui";
import { TouchableOpacity } from "react-native";
import {
  Settings,
  Menu,
  Hash,
  Users,
  WifiOff,
  MessageCircle,
  Phone,
  Video,
  FileText,
} from "@tamagui/lucide-icons";
import type { Server } from "./types";
import type { CallState } from "../../../../utils/useWebRTC";
import type { ConversationData } from "../../../../utils/api";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface ChatHeaderProps {
  isDmMode: boolean;
  dmPartnerName: string | null;
  selectedServer: Server | null;
  isMobile: boolean;
  isDesktop: boolean;
  showReconnecting: boolean;
  callState: CallState;
  unreadDmCount: number;
  unreadServerCount: number;
  activeConversation?: ConversationData;
  onToggleServerSidebar: () => void;
  onToggleUserSidebar: () => void;
  onOpenSettings: () => void;
  onStartCall: (type: "voice" | "video") => void;
  onToggleDocuments: () => void;
  documentCount?: number;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  isDmMode,
  dmPartnerName,
  selectedServer,
  isMobile,
  isDesktop,
  showReconnecting,
  callState,
  unreadDmCount,
  unreadServerCount,
  activeConversation,
  onToggleServerSidebar,
  onToggleUserSidebar,
  onOpenSettings,
  onStartCall,
  onToggleDocuments,
  documentCount,
}) => {
  const { fontFamily } = usePreferences();
  const headerTitle = isDmMode
    ? (dmPartnerName ? `@${dmPartnerName}` : "Direct Message")
    : selectedServer?.name || "";

  const headerIcon = isDmMode
    ? <MessageCircle size={isMobile ? 20 : 24} color="#6B7280" />
    : <Hash size={isMobile ? 20 : 24} color="#6B7280" />;

  const totalUnread = unreadDmCount + unreadServerCount;

  return (
    <XStack
      height={isMobile ? 56 : 64}
      paddingHorizontal={isMobile ? "$3" : "$4"}
      alignItems="center"
      justifyContent="space-between"
      backgroundColor="#171823"
      borderBottomWidth={1}
      borderBottomColor="#2D2E3F"
    >
      <XStack alignItems="center" gap="$3" flex={1}>
        {!isDesktop && (
          <TouchableOpacity onPress={onToggleServerSidebar} style={{ position: "relative" }}>
            <Menu size={24} color="#9CA3AF" />
            {totalUnread > 0 && (
              <YStack
                position="absolute"
                right={-6}
                top={-6}
                backgroundColor="#EF4444"
                borderRadius={8}
                minWidth={16}
                height={16}
                justifyContent="center"
                alignItems="center"
                paddingHorizontal={4}
              >
                <Text color="white" fontSize={10} fontWeight="700" fontFamily={fontFamily}>
                  {totalUnread > 9 ? "9+" : totalUnread}
                </Text>
              </YStack>
            )}
          </TouchableOpacity>
        )}
        {headerIcon}
        <Text
          fontSize={isMobile ? "$5" : "$7"}
          fontWeight="600"
          color="white"
          numberOfLines={1}
          flex={1}
          fontFamily={fontFamily}
        >
          {headerTitle}
        </Text>
      </XStack>
      <XStack gap="$2" alignItems="center">
        {showReconnecting && (
          <XStack
            backgroundColor="rgba(239,68,68,0.2)"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
            alignItems="center"
            gap="$1"
          >
            <WifiOff size={14} color="#EF4444" />
            {!isMobile && (
              <Text color="#EF4444" fontSize="$1" fontWeight="600" fontFamily={fontFamily}>
                Reconnecting
              </Text>
            )}
          </XStack>
        )}
        {/* Documents button - available in both DM and server mode */}
        <YStack position="relative">
          <Button
            size="$3"
            backgroundColor="transparent"
            borderWidth={1}
            borderColor="#10B981"
            icon={<FileText size={16} color="#10B981" />}
            onPress={onToggleDocuments}
            pressStyle={{ backgroundColor: "rgba(67,181,129,0.1)" }}
          >
            {!isMobile && "Docs"}
          </Button>
          {(documentCount ?? 0) > 0 && (
            <YStack
              position="absolute"
              right={-4}
              top={-4}
              backgroundColor="#10B981"
              borderRadius={8}
              minWidth={16}
              height={16}
              justifyContent="center"
              alignItems="center"
              paddingHorizontal={4}
              pointerEvents="none"
            >
              <Text color="white" fontSize={9} fontWeight="700" fontFamily={fontFamily}>
                {(documentCount ?? 0) > 9 ? "9+" : documentCount}
              </Text>
            </YStack>
          )}
        </YStack>
        {/* Call buttons in DM mode */}
        {isDmMode && activeConversation && (
          <>
            <Button
              size="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#0EA5E9"
              icon={<Phone size={16} color="#0EA5E9" />}
              onPress={() => onStartCall("voice")}
              pressStyle={{ backgroundColor: "rgba(14,165,233,0.1)" }}
              disabled={callState.status !== "idle"}
            />
            <Button
              size="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#0EA5E9"
              icon={<Video size={16} color="#0EA5E9" />}
              onPress={() => onStartCall("video")}
              pressStyle={{ backgroundColor: "rgba(14,165,233,0.1)" }}
              disabled={callState.status !== "idle"}
            />
          </>
        )}
        {/* Only show Users and Settings buttons in server mode */}
        {!isDmMode && (
          <>
            {!isMobile && (
              <Button
                size="$3"
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#0EA5E9"
                icon={<Users size={16} color="#0EA5E9" />}
                onPress={onToggleUserSidebar}
                pressStyle={{
                  backgroundColor: "rgba(14,165,233,0.1)",
                }}
              />
            )}
            <Button
              size="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#0EA5E9"
              icon={<Settings size={16} color="#0EA5E9" />}
              onPress={onOpenSettings}
              pressStyle={{
                backgroundColor: "rgba(14,165,233,0.1)",
              }}
            >
              {!isMobile && "Settings"}
            </Button>
          </>
        )}
      </XStack>
    </XStack>
  );
};

export default React.memo(ChatHeader);
