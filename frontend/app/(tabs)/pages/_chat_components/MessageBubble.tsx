import React from "react";
import { YStack, XStack, Text, Input, Button, Card } from "tamagui";
import { Pressable, TouchableOpacity } from "react-native";
import { MoreVertical } from "@tamagui/lucide-icons";
import AttachmentImagePreview, { isImageMimeType } from "./AttachmentImagePreview";
import FileAttachmentCard from "./FileAttachmentCard";
import type { Message, MessageAttachment, ImageDecryptContext } from "./types";

interface MessageBubbleProps {
  msg: Message;
  editingMessageId: number | null;
  editContent: string;
  onEditContentChange: (text: string) => void;
  onEditSave: (id: number) => void;
  onEditCancel: () => void;
  onUserPress: (userId: number, username: string) => void;
  onLongPress: (messageId: number) => void;
  onMorePress: (messageId: number) => void;
  formatTimestamp: (isoString: string) => string;
  isMobile: boolean;
  userId: number | null;
  imageDecryptCtxRef: React.MutableRefObject<ImageDecryptContext>;
  onDownloadAttachment: (attachment: MessageAttachment) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  editingMessageId,
  editContent,
  onEditContentChange,
  onEditSave,
  onEditCancel,
  onUserPress,
  onLongPress,
  onMorePress,
  formatTimestamp,
  isMobile,
  userId,
  imageDecryptCtxRef,
  onDownloadAttachment,
}) => {
  return (
    <Pressable
      onLongPress={() => onLongPress(msg.id)}
      delayLongPress={300}
      style={{ marginBottom: isMobile ? 12 : 8 }}
    >
      <Card
        backgroundColor={editingMessageId === msg.id ? "#40444b" : "#2c2f33"}
        padding={isMobile ? "$3" : "$3"}
        borderRadius="$3"
      >
        {editingMessageId === msg.id ? (
          <XStack gap="$2">
            <Input
              flex={1}
              value={editContent}
              onChangeText={onEditContentChange}
              multiline
              numberOfLines={4}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              placeholder="Edit your message"
              //@ts-ignore
              placeholderTextColor="#72767d"
              autoFocus
              fontSize={isMobile ? "$4" : "$3"}
            />
            <XStack justifyContent="flex-end" gap="$2">
              <Button
                size="$3"
                onPress={onEditCancel}
                backgroundColor="#40444b"
              >
                Cancel
              </Button>
              <Button
                size="$3"
                onPress={() => onEditSave(msg.id)}
                backgroundColor="#5865F2"
              >
                Save
              </Button>
            </XStack>
          </XStack>
        ) : (
          <YStack gap="$1">
            <XStack alignItems="center" justifyContent="space-between">
              <XStack alignItems="center" flex={1} gap="$2">
                <Pressable onPress={() => onUserPress(msg.user_id, msg.username)}>
                  <Text fontWeight="700" color="white" fontSize={isMobile ? "$5" : "$4"}>
                    {msg.username}
                  </Text>
                </Pressable>
                <Text fontSize={isMobile ? "$2" : "$1"} color="#72767d">
                  {formatTimestamp(msg.timestamp)}
                </Text>
              </XStack>
              <TouchableOpacity onPress={() => onMorePress(msg.id)}>
                <MoreVertical size={20} color="#b9bbbe" />
              </TouchableOpacity>
            </XStack>
            {/* Message text content (hide if it's just the auto-generated file reference) */}
            {msg.content && !msg.content.startsWith("📎 ") && (
              <Text color="#dcddde" fontSize={isMobile ? "$4" : "$3"} lineHeight={isMobile ? 22 : 20}>
                {msg.content}
              </Text>
            )}
            {/* Attachment rendering */}
            {msg.attachment && (
              isImageMimeType(msg.attachment.mime_type)
                ? <AttachmentImagePreview attachment={msg.attachment} ctxRef={imageDecryptCtxRef} />
                : <FileAttachmentCard attachment={msg.attachment} onDownload={onDownloadAttachment} isMobile={isMobile} />
            )}
          </YStack>
        )}
      </Card>
    </Pressable>
  );
};

export default React.memo(MessageBubble);
