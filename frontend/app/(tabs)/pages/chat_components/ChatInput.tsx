import React, { useState, useCallback, useRef } from "react";
import { YStack, XStack, Text, Input, Button, Spinner } from "tamagui";
import { Platform, TouchableOpacity } from "react-native";
import {
  Send,
  Paperclip,
  X as CloseIcon,
  FileText,
  Image as ImageIcon,
  Mic,
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
  fontSizeValue?: number;
  fontFamily?: string;
  inputRef?: React.RefObject<any>;
  replyingTo?: { id: number; content: string; username: string } | null;
  onCancelReply?: () => void;
  slowModeRemaining?: number;
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
  fontSizeValue = 15,
  fontFamily,
  inputRef,
  replyingTo,
  onCancelReply,
  slowModeRemaining = 0,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const hasSpeechRecognition = Platform.OS === "web" && typeof window !== "undefined" &&
    (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));

  const toggleRecording = useCallback(() => {
    if (Platform.OS !== "web") return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const transcript = last[0].transcript.trim();
        if (transcript) {
          onInputChange(input ? input + " " + transcript : transcript);
        }
      }
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, input, onInputChange]);

  // Permission denied state
  if (!isDmMode && (!canSendMessages || channelPermissionDenied)) {
    return (
      <XStack
        padding={isMobile ? "$2" : "$3"}
        paddingBottom={Platform.OS === "ios" ? bottomInset : (isMobile ? "$2" : "$3")}
        backgroundColor="#171823"
        borderTopWidth={1}
        borderTopColor="#2D2E3F"
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
          <Text color="#F59E0B" fontSize={isMobile ? "$3" : "$2"} textAlign="center">
            You do not have permission to send messages in this channel.
          </Text>
        </YStack>
      </XStack>
    );
  }

  return (
    <YStack
      backgroundColor="#171823"
      borderTopWidth={1}
      borderTopColor="#2D2E3F"
    >
      {/* Reply preview bar */}
      {replyingTo && (
        <XStack
          padding="$2"
          paddingHorizontal="$3"
          backgroundColor="#2D2E3F"
          alignItems="center"
          gap="$2"
          borderLeftWidth={3}
          borderLeftColor="#0EA5E9"
        >
          <YStack flex={1}>
            <Text color="#0EA5E9" fontSize="$2" fontWeight="700">
              {replyingTo.username}
            </Text>
            <Text color="#9CA3AF" fontSize="$2" numberOfLines={1}>
              {replyingTo.content.length > 100
                ? replyingTo.content.slice(0, 100) + "..."
                : replyingTo.content}
            </Text>
          </YStack>
          <TouchableOpacity onPress={onCancelReply}>
            <CloseIcon size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </XStack>
      )}
      {/* Pending attachment preview */}
      {pendingAttachment && (
        <XStack
          padding="$2"
          paddingHorizontal="$3"
          backgroundColor="#2D2E3F"
          alignItems="center"
          gap="$2"
        >
          {isImageMimeType(pendingAttachment.mimeType)
            ? <ImageIcon size={16} color="#0EA5E9" />
            : <FileText size={16} color="#0EA5E9" />
          }
          <Text color="#D1D5DB" fontSize="$2" flex={1} numberOfLines={1}>
            {pendingAttachment.name} ({formatFileSize(pendingAttachment.size)})
          </Text>
          <TouchableOpacity onPress={onCancelAttachment}>
            <CloseIcon size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </XStack>
      )}
      {/* Upload progress */}
      {isUploading && (
        <XStack padding="$2" paddingHorizontal="$3" alignItems="center" gap="$2">
          <Spinner size="small" color="#0EA5E9" />
          <Text color="#6B7280" fontSize="$2">Encrypting and uploading...</Text>
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
          <Paperclip size={isMobile ? 22 : 20} color="#9CA3AF" />
        </TouchableOpacity>
        {/* Speech-to-Text button (web only) */}
        {hasSpeechRecognition && (
          <TouchableOpacity
            onPress={toggleRecording}
            style={{ padding: 8 }}
          >
            <Mic size={isMobile ? 22 : 20} color={isRecording ? "#EF4444" : "#9CA3AF"} />
          </TouchableOpacity>
        )}
        <Input
          ref={inputRef}
          flex={1}
          //@ts-ignore
          placeholderTextColor="#6B7280"
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
          backgroundColor="#2D2E3F"
          borderWidth={0}
          color="white"
          borderRadius="$4"
          padding={isMobile ? "$3" : "$3"}
          fontSize={fontSizeValue}
          fontFamily={fontFamily}
          onSubmitEditing={isMobile ? undefined : onSend}
        />
        <Button
          backgroundColor={slowModeRemaining > 0 ? "#4B5563" : "#0EA5E9"}
          onPress={onSend}
          disabled={(!input.trim() && !pendingAttachment) || isUploading || slowModeRemaining > 0}
          pressStyle={{
            backgroundColor: "#0284C7",
          }}
          disabledStyle={{
            opacity: 0.5,
          }}
          size={isMobile ? "$4" : "$4"}
          icon={isMobile && slowModeRemaining <= 0 ? <Send size={20} color="white" /> : undefined}
        >
          {slowModeRemaining > 0
            ? `${slowModeRemaining}s`
            : !isMobile
              ? (pendingAttachment ? "Upload" : "Send")
              : ""
          }
        </Button>
      </XStack>
    </YStack>
  );
};

export default React.memo(ChatInput);
