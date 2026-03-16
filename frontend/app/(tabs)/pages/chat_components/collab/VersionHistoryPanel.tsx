import React from "react";
import { FlatList, TouchableOpacity } from "react-native";
import { YStack, XStack, Text, Button } from "tamagui";
import { Clock, ArrowLeft, RotateCcw } from "@tamagui/lucide-icons";
import type { DocumentVersionData } from "../../../../../utils/api";
import { usePreferences } from "../../../../../utils/PreferencesContext";

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
  const { fontFamily } = usePreferences();
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
          <Clock size={16} color="#0EA5E9" />
          <YStack flex={1}>
            <Text color="white" fontSize={13} fontWeight="600" fontFamily={fontFamily}>
              Version {item.version_number}
            </Text>
            <Text color="#6B7280" fontSize={11} fontFamily={fontFamily}>
              {formatDate(item.created_at)}
            </Text>
          </YStack>
          <Button
            size="$2"
            backgroundColor="transparent"
            borderWidth={1}
            borderColor="#10B981"
            onPress={(e: any) => {
              e.stopPropagation?.();
              onRestoreVersion(item);
            }}
            icon={<RotateCcw size={12} color="#10B981" />}
          >
            <Text color="#10B981" fontSize={10} fontFamily={fontFamily}>Restore</Text>
          </Button>
        </XStack>
      </TouchableOpacity>
    );
  };

  return (
    <YStack
      width={260}
      backgroundColor="#171823"
      borderLeftWidth={1}
      borderLeftColor="#2D2E3F"
      height="100%"
    >
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        gap="$2"
        borderBottomWidth={1}
        borderBottomColor="#2D2E3F"
      >
        <TouchableOpacity onPress={onClose}>
          <ArrowLeft size={18} color="#9CA3AF" />
        </TouchableOpacity>
        <Text color="white" fontSize={14} fontWeight="600" fontFamily={fontFamily}>
          Version History
        </Text>
      </XStack>

      {versions.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
          <Clock size={32} color="#6B7280" />
          <Text color="#6B7280" fontSize={13} textAlign="center" marginTop="$2" fontFamily={fontFamily}>
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
