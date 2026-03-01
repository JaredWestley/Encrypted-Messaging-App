import React from "react";
import { XStack, YStack, Text } from "tamagui";
import { TouchableOpacity } from "react-native";
import { FileText, Download } from "@tamagui/lucide-icons";
import { formatFileSize } from "./AttachmentImagePreview";
import type { MessageAttachment } from "./types";

const FileAttachmentCard = React.memo(function FileAttachmentCard({
  attachment,
  onDownload,
  isMobile,
}: {
  attachment: MessageAttachment;
  onDownload: (a: MessageAttachment) => void;
  isMobile: boolean;
}) {
  return (
    <TouchableOpacity onPress={() => onDownload(attachment)}>
      <XStack
        backgroundColor="#2f3136"
        borderWidth={1}
        borderColor="#40444b"
        borderRadius="$3"
        padding="$3"
        alignItems="center"
        gap="$3"
        marginTop="$1"
      >
        <FileText size={32} color="#5865F2" />
        <YStack flex={1}>
          <Text color="#00b0f4" fontSize={isMobile ? "$3" : "$2"} numberOfLines={1}>
            {attachment.original_filename}
          </Text>
          <Text color="#72767d" fontSize="$1">
            {formatFileSize(attachment.file_size)}
          </Text>
        </YStack>
        <Download size={20} color="#b9bbbe" />
      </XStack>
    </TouchableOpacity>
  );
});

export default FileAttachmentCard;
