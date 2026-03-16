import React, { useState, useCallback } from "react";
import { YStack, XStack, Text, Input, Button, Card } from "tamagui";
import { Pressable, TouchableOpacity, Platform } from "react-native";
import { MoreVertical, Volume2, SmilePlus, CornerUpLeft } from "@tamagui/lucide-icons";
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
  fontSizeValue?: number;
  fontFamily?: string;
  onReplyPress?: (messageId: number) => void;
  onReactionToggle?: (messageId: number, emoji: string) => void;
  onReactPress?: (messageId: number) => void;
  currentUserId?: number;
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
  fontSizeValue = 15,
  fontFamily,
  onReplyPress,
  onReactionToggle,
  onReactPress,
  currentUserId,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeak = useCallback(() => {
    if (Platform.OS !== "web") return;
    if (!("speechSynthesis" in window)) return;
    if (!msg.content || msg.content.startsWith("📎 ")) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(msg.content);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [msg.content, isSpeaking]);

  const timestampFull = msg.timestamp
    ? new Date(msg.timestamp).toLocaleString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric", hour12: true,
      })
    : "";

  const usernameFontSize = fontSizeValue + 2;
  const timestampFontSize = Math.max(10, fontSizeValue - 4);
  const contentFontSize = fontSizeValue;

  return (
    <Pressable
      onLongPress={() => onLongPress(msg.id)}
      delayLongPress={300}
      style={{ marginBottom: isMobile ? 12 : 8 }}
    >
      <Card
        backgroundColor={editingMessageId === msg.id ? "#2D2E3F" : "#252636"}
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
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              placeholder="Edit your message"
              //@ts-ignore
              placeholderTextColor="#6B7280"
              autoFocus
              fontSize={isMobile ? "$4" : "$3"}
            />
            <XStack justifyContent="flex-end" gap="$2">
              <Button
                size="$3"
                onPress={onEditCancel}
                backgroundColor="#2D2E3F"
              >
                Cancel
              </Button>
              <Button
                size="$3"
                onPress={() => onEditSave(msg.id)}
                backgroundColor="#0EA5E9"
              >
                Save
              </Button>
            </XStack>
          </XStack>
        ) : (
          <YStack gap="$1">
            {/* Reply preview */}
            {msg.reply_to && (
              <Pressable onPress={() => onReplyPress?.(msg.reply_to!.id)}>
                <XStack
                  backgroundColor="#1E1F2B"
                  borderLeftWidth={3}
                  borderLeftColor="#0EA5E9"
                  borderRadius="$2"
                  padding="$2"
                  marginBottom="$1"
                  alignItems="center"
                  gap="$2"
                >
                  <CornerUpLeft size={14} color="#0EA5E9" />
                  <YStack flex={1}>
                    <Text color="#0EA5E9" fontSize={12} fontWeight="700">
                      {msg.reply_to.username}
                    </Text>
                    <Text color="#6B7280" fontSize={12} numberOfLines={1}>
                      {(() => {
                        const c = msg.reply_to!.content;
                        // Detect encrypted content (base64 ciphertext)
                        if (/^[A-Za-z0-9+/=]{20,}$/.test(c)) return "🔒 Encrypted message";
                        return c.length > 80 ? c.slice(0, 80) + "..." : c;
                      })()}
                    </Text>
                  </YStack>
                </XStack>
              </Pressable>
            )}
            <XStack alignItems="center" justifyContent="space-between">
              <XStack alignItems="center" flex={1} gap="$2">
                <Pressable onPress={() => onUserPress(msg.user_id, msg.username)}>
                  <Text fontWeight="700" color="white" fontSize={usernameFontSize} fontFamily={fontFamily}>
                    {msg.username}
                  </Text>
                </Pressable>
                <Text
                  fontSize={timestampFontSize}
                  color="#6B7280"
                  fontFamily={fontFamily}
                  {...(Platform.OS === "web" ? { title: timestampFull } : {})}
                >
                  {formatTimestamp(msg.timestamp)}
                </Text>
                {/* TTS button (web only) */}
                {Platform.OS === "web" && msg.content && !msg.content.startsWith("📎 ") && (
                  <TouchableOpacity onPress={handleSpeak} style={{ marginLeft: 4 }}>
                    <Volume2 size={14} color={isSpeaking ? "#0EA5E9" : "#6B7280"} />
                  </TouchableOpacity>
                )}
              </XStack>
              <TouchableOpacity onPress={() => onMorePress(msg.id)}>
                <MoreVertical size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </XStack>
            {/* Message text content (hide if it's just the auto-generated file reference) */}
            {msg.content && !msg.content.startsWith("📎 ") && (
              <Text color="#D1D5DB" fontSize={contentFontSize} fontFamily={fontFamily} lineHeight={contentFontSize + 6}>
                {msg.content}
              </Text>
            )}
            {/* Attachment rendering */}
            {msg.attachment && (
              isImageMimeType(msg.attachment.mime_type)
                ? <AttachmentImagePreview attachment={msg.attachment} ctxRef={imageDecryptCtxRef} />
                : <FileAttachmentCard attachment={msg.attachment} onDownload={onDownloadAttachment} isMobile={isMobile} />
            )}
            {/* Reactions */}
            {msg.reactions && msg.reactions.length > 0 && (
              <XStack flexWrap="wrap" gap="$1" marginTop="$1">
                {msg.reactions.map((reaction) => {
                  const userReacted = currentUserId
                    ? reaction.users.some((u) => u.user_id === currentUserId)
                    : false;
                  return (
                    <TouchableOpacity
                      key={reaction.emoji}
                      onPress={() => onReactionToggle?.(msg.id, reaction.emoji)}
                    >
                      <XStack
                        backgroundColor={userReacted ? "rgba(14,165,233,0.2)" : "#2D2E3F"}
                        borderWidth={1}
                        borderColor={userReacted ? "#0EA5E9" : "transparent"}
                        borderRadius={12}
                        paddingHorizontal={8}
                        paddingVertical={2}
                        alignItems="center"
                        gap={4}
                      >
                        <Text fontSize={14}>{reaction.emoji}</Text>
                        <Text color={userReacted ? "#0EA5E9" : "#9CA3AF"} fontSize={12}>
                          {reaction.count}
                        </Text>
                      </XStack>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => onReactPress?.(msg.id)}>
                  <XStack
                    backgroundColor="#2D2E3F"
                    borderRadius={12}
                    paddingHorizontal={6}
                    paddingVertical={2}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <SmilePlus size={14} color="#6B7280" />
                  </XStack>
                </TouchableOpacity>
              </XStack>
            )}
          </YStack>
        )}
      </Card>
    </Pressable>
  );
};

export default React.memo(MessageBubble);
