import React from "react";
import { FlatList, TouchableOpacity } from "react-native";
import { YStack, XStack, Text, Button } from "tamagui";
import { Clock, ArrowLeft, RotateCcw } from "@tamagui/lucide-icons";
import type { DocumentVersionData } from "../../../../../utils/api";

interface VersionHistoryPanelProps {
  versions: DocumentVersionData[];
  onSelectVersion: (version: DocumentVersionData) => void;
  onRestoreVersion: (version: DocumentVersionData) => void;
  onClose: () => void;
  currentVersionId?: number | null;
}

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  versions,
  onSelectVersion,
  onRestoreVersion,
  onClose,
  currentVersionId,
}) => {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  const renderItem = ({ item }: { item: DocumentVersionData }) => {
    const isActive = currentVersionId === item.id;
    return (
      <TouchableOpacity onPress={() => onSelectVersion(item)}>
        <XStack
          backgroundColor={isActive ? "rgba(88,101,242,0.15)" : "transparent"}
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius="$2"
          marginHorizontal="$2"
          marginVertical={2}
          alignItems="center"
          gap="$2"
          hoverStyle={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <Clock size={16} color="#5865F2" />
          <YStack flex={1}>
            <Text color="white" fontSize={13} fontWeight="600">
              Version {item.version_number}
            </Text>
            <Text color="#72767d" fontSize={11}>
              {formatDate(item.created_at)}
            </Text>
          </YStack>
          <Button
            size="$2"
            backgroundColor="transparent"
            borderWidth={1}
            borderColor="#43B581"
            onPress={(e: any) => {
              e.stopPropagation?.();
              onRestoreVersion(item);
            }}
            icon={<RotateCcw size={12} color="#43B581" />}
          >
            <Text color="#43B581" fontSize={10}>Restore</Text>
          </Button>
        </XStack>
      </TouchableOpacity>
    );
  };

  return (
    <YStack
      width={260}
      backgroundColor="#2f3136"
      borderLeftWidth={1}
      borderLeftColor="#202225"
      height="100%"
    >
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        gap="$2"
        borderBottomWidth={1}
        borderBottomColor="#202225"
      >
        <TouchableOpacity onPress={onClose}>
          <ArrowLeft size={18} color="#b9bbbe" />
        </TouchableOpacity>
        <Text color="white" fontSize={14} fontWeight="600">
          Version History
        </Text>
      </XStack>

      {versions.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
          <Clock size={32} color="#72767d" />
          <Text color="#72767d" fontSize={13} textAlign="center" marginTop="$2">
            No versions saved yet
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={versions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 4 }}
        />
      )}
    </YStack>
  );
};

export default React.memo(VersionHistoryPanel);
