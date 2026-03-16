import React from "react";
import { XStack, YStack, Text } from "tamagui";
import { TouchableOpacity } from "react-native";
import { FileText, Download } from "@tamagui/lucide-icons";
import { formatFileSize } from "./AttachmentImagePreview";
import type { MessageAttachment } from "./types";
import { usePreferences } from "../../../../utils/PreferencesContext";

const FileAttachmentCard = React.memo(function FileAttachmentCard({
  attachment,
  onDownload,
  isMobile,
}: {
  attachment: MessageAttachment;
  onDownload: (a: MessageAttachment) => void;
  isMobile: boolean;
}) {
  const { fontFamily } = usePreferences();
  return (
    <TouchableOpacity onPress={() => onDownload(attachment)}>
      <XStack
        backgroundColor="#171823"
        borderWidth={1}
        borderColor="#2D2E3F"
        borderRadius="$3"
        padding="$3"
        alignItems="center"
        gap="$3"
        marginTop="$1"
      >
        <FileText size={32} color="#0EA5E9" />
        <YStack flex={1}>
          <Text color="#00b0f4" fontSize={isMobile ? "$3" : "$2"} numberOfLines={1} fontFamily={fontFamily}>
            {attachment.original_filename}
          </Text>
          <Text color="#6B7280" fontSize="$1" fontFamily={fontFamily}>
            {formatFileSize(attachment.file_size)}
          </Text>
        </YStack>
        <Download size={20} color="#9CA3AF" />
      </XStack>
    </TouchableOpacity>
  );
});

export default FileAttachmentCard;
