import React from "react";
import { YStack, XStack, Text, Input, Button, Spinner } from "tamagui";
import { Platform, TouchableOpacity } from "react-native";
import {
  Send,
  Paperclip,
  X as CloseIcon,
  FileText,
  Image as ImageIcon,
} from "@tamagui/lucide-icons";
import { isImageMimeType, formatFileSize } from "./AttachmentImagePreview";
import type { Server } from "./types";
import type { ConversationData } from "../../../../utils/api";

interface PendingAttachment {
  name: string;
  size: number;
  mimeType: string;
  uri: string;
}

interface ChatInputProps {
  input: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onPickFile: () => void;
  onCancelAttachment: () => void;
  pendingAttachment: PendingAttachment | null;
  isUploading: boolean;
  canSendMessages: boolean;
  channelPermissionDenied: boolean;
  isMobile: boolean;
  isDmMode: boolean;
  selectedServer: Server | null;
  activeConversation?: ConversationData;
  getConversationDisplayName: (convo: ConversationData) => string;
  bottomInset: number;
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  onInputChange,
  onSend,
  onPickFile,
  onCancelAttachment,
  pendingAttachment,
  isUploading,
  canSendMessages,
  channelPermissionDenied,
  isMobile,
  isDmMode,
  selectedServer,
  activeConversation,
  getConversationDisplayName,
  bottomInset,
}) => {
  // Permission denied state
  if (!isDmMode && (!canSendMessages || channelPermissionDenied)) {
    return (
      <XStack
        padding={isMobile ? "$2" : "$3"}
        paddingBottom={Platform.OS === "ios" ? bottomInset : (isMobile ? "$2" : "$3")}
        backgroundColor="#2f3136"
        borderTopWidth={1}
        borderTopColor="#202225"
        alignItems="center"
        justifyContent="center"
      >
        <YStack
          flex={1}
          backgroundColor="rgba(255, 152, 0, 0.1)"
          borderWidth={1}
          borderColor="rgba(255, 152, 0, 0.3)"
          borderRadius="$4"
          padding="$3"
          alignItems="center"
        >
          <Text color="#ff9800" fontSize={isMobile ? "$3" : "$2"} textAlign="center">
            You do not have permission to send messages in this channel.
          </Text>
        </YStack>
      </XStack>
    );
  }

  return (
    <YStack
      backgroundColor="#2f3136"
      borderTopWidth={1}
      borderTopColor="#202225"
    >
      {/* Pending attachment preview */}
      {pendingAttachment && (
        <XStack
          padding="$2"
          paddingHorizontal="$3"
          backgroundColor="#40444b"
          alignItems="center"
          gap="$2"
        >
          {isImageMimeType(pendingAttachment.mimeType)
            ? <ImageIcon size={16} color="#5865F2" />
            : <FileText size={16} color="#5865F2" />
          }
          <Text color="#dcddde" fontSize="$2" flex={1} numberOfLines={1}>
            {pendingAttachment.name} ({formatFileSize(pendingAttachment.size)})
          </Text>
          <TouchableOpacity onPress={onCancelAttachment}>
            <CloseIcon size={16} color="#b9bbbe" />
          </TouchableOpacity>
        </XStack>
      )}
      {/* Upload progress */}
      {isUploading && (
        <XStack padding="$2" paddingHorizontal="$3" alignItems="center" gap="$2">
          <Spinner size="small" color="#5865F2" />
          <Text color="#72767d" fontSize="$2">Encrypting and uploading...</Text>
        </XStack>
      )}
      <XStack
        padding={isMobile ? "$2" : "$3"}
        paddingBottom={Platform.OS === "ios" ? bottomInset : (isMobile ? "$2" : "$3")}
        alignItems="flex-end"
        gap="$2"
      >
        {/* Attachment button */}
        <TouchableOpacity
          onPress={onPickFile}
          disabled={isUploading}
          style={{ padding: 8, opacity: isUploading ? 0.5 : 1 }}
        >
          <Paperclip size={isMobile ? 22 : 20} color="#b9bbbe" />
        </TouchableOpacity>
        <Input
          flex={1}
          //@ts-ignore
          placeholderTextColor="#72767d"
          placeholder={pendingAttachment
            ? "Add a message (optional)..."
            : isDmMode && activeConversation
              ? `Message ${getConversationDisplayName(activeConversation)}`
              : selectedServer
                ? `Message ${selectedServer.name}`
                : "Type a message..."
          }
          value={input}
          onChangeText={onInputChange}
          multiline
          numberOfLines={1}
          maxLength={2000}
          backgroundColor="#40444b"
          borderWidth={0}
          color="white"
          borderRadius="$4"
          padding={isMobile ? "$3" : "$3"}
          fontSize={isMobile ? "$4" : "$3"}
          onSubmitEditing={isMobile ? undefined : onSend}
        />
        <Button
          backgroundColor="#5865F2"
          onPress={onSend}
          disabled={(!input.trim() && !pendingAttachment) || isUploading}
          pressStyle={{
            backgroundColor: "#4752c4",
          }}
          disabledStyle={{
            opacity: 0.5,
          }}
          size={isMobile ? "$4" : "$4"}
          icon={isMobile ? <Send size={20} color="white" /> : undefined}
        >
          {!isMobile && (pendingAttachment ? "Upload" : "Send")}
        </Button>
      </XStack>
    </YStack>
  );
};

export default React.memo(ChatInput);
