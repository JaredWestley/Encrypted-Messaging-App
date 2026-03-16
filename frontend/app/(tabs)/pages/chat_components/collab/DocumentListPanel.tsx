import React, { useState } from "react";
import { FlatList, TouchableOpacity, Alert as RNAlert, Platform } from "react-native";
import { YStack, XStack, Text, Button, Input } from "tamagui";
import {
  FileText,
  PenTool,
  Plus,
  Trash2,
  Edit3,
  X as CloseIcon,
  Clock,
  ChevronLeft,
} from "@tamagui/lucide-icons";
import type { CollabDocumentData } from "../../../../../utils/api";
import { usePreferences } from "../../../../../utils/PreferencesContext";

interface DocumentListPanelProps {
  documents: CollabDocumentData[];
  onCreateDocument: (title: string, docType: "document" | "whiteboard") => void;
  onSelectDocument: (doc: CollabDocumentData) => void;
  onDeleteDocument: (docId: number) => void;
  onRenameDocument: (docId: number, newTitle: string) => void;
  onClose: () => void;
  selectedDocId?: number | null;
  isMobile: boolean;
}

const DocumentListPanel: React.FC<DocumentListPanelProps> = ({
  documents,
  onCreateDocument,
  onSelectDocument,
  onDeleteDocument,
  onRenameDocument,
  onClose,
  selectedDocId,
  isMobile,
}) => {
  const { fontFamily } = usePreferences();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createType, setCreateType] = useState<"document" | "whiteboard">("document");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const handleCreate = () => {
    const title = newTitle.trim() || (createType === "document" ? "Untitled Document" : "Untitled Whiteboard");
    onCreateDocument(title, createType);
    setNewTitle("");
    setShowCreate(false);
  };

  const handleDelete = (docId: number, docTitle: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${docTitle}"? This cannot be undone.`)) {
        onDeleteDocument(docId);
      }
    } else {
      RNAlert.alert("Delete Document", `Delete "${docTitle}"? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteDocument(docId) },
      ]);
    }
  };

  const handleRenameSubmit = (docId: number) => {
    if (renameTitle.trim()) {
      onRenameDocument(docId, renameTitle.trim());
    }
    setRenamingId(null);
    setRenameTitle("");
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: CollabDocumentData }) => {
    const isSelected = selectedDocId === item.id;
    const isRenaming = renamingId === item.id;
    const Icon = item.doc_type === "whiteboard" ? PenTool : FileText;

    return (
      <TouchableOpacity
        onPress={() => !isRenaming && onSelectDocument(item)}
        activeOpacity={0.7}
      >
        <XStack
          backgroundColor={isSelected ? "rgba(88,101,242,0.15)" : "transparent"}
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius="$2"
          marginHorizontal="$2"
          marginVertical={2}
          alignItems="center"
          gap="$2"
          hoverStyle={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <Icon size={18} color={item.doc_type === "whiteboard" ? "#10B981" : "#0EA5E9"} />
          <YStack flex={1}>
            {isRenaming ? (
              <XStack gap="$1" alignItems="center">
                <Input
                  size="$2"
                  flex={1}
                  value={renameTitle}
                  onChangeText={setRenameTitle}
                  onSubmitEditing={() => handleRenameSubmit(item.id)}
                  autoFocus
                  backgroundColor="#2D2E3F"
                  color="white"
                  borderColor="#0EA5E9"
                  fontFamily={fontFamily}
                />
                <Button
                  size="$2"
                  backgroundColor="#0EA5E9"
                  onPress={() => handleRenameSubmit(item.id)}
                >
                  <Text color="white" fontSize={11} fontFamily={fontFamily}>Save</Text>
                </Button>
                <Button
                  size="$2"
                  backgroundColor="transparent"
                  onPress={() => { setRenamingId(null); setRenameTitle(""); }}
                >
                  <CloseIcon size={14} color="#9CA3AF" />
                </Button>
              </XStack>
            ) : (
              <>
                <Text color="white" fontSize={14} numberOfLines={1} fontFamily={fontFamily}>
                  {item.title}
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Clock size={10} color="#6B7280" />
                  <Text color="#6B7280" fontSize={11} fontFamily={fontFamily}>
                    {formatDate(item.updated_at)}
                  </Text>
                </XStack>
              </>
            )}
          </YStack>
          {!isRenaming && (
            <XStack gap="$1">
              <TouchableOpacity
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  setRenamingId(item.id);
                  setRenameTitle(item.title);
                }}
              >
                <Edit3 size={14} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  handleDelete(item.id, item.title);
                }}
              >
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
            </XStack>
          )}
        </XStack>
      </TouchableOpacity>
    );
  };

  return (
    <YStack
      width={isMobile ? "100%" : 280}
      backgroundColor="#171823"
      borderRightWidth={isMobile ? 0 : 1}
      borderRightColor="#2D2E3F"
      height="100%"
    >
      {/* Header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor="#2D2E3F"
      >
        <XStack alignItems="center" gap="$2">
          {isMobile && (
            <TouchableOpacity onPress={onClose}>
              <ChevronLeft size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          <Text color="white" fontSize={16} fontWeight="600" fontFamily={fontFamily}>
            Documents
          </Text>
        </XStack>
        <XStack gap="$2" alignItems="center">
          <Button
            size="$2"
            backgroundColor="#0EA5E9"
            icon={<Plus size={14} color="white" />}
            onPress={() => setShowCreate(!showCreate)}
            pressStyle={{ backgroundColor: "#0284C7" }}
          />
          {!isMobile && (
            <TouchableOpacity onPress={onClose}>
              <CloseIcon size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </XStack>
      </XStack>

      {/* Create New */}
      {showCreate && (
        <YStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          gap="$2"
          borderBottomWidth={1}
          borderBottomColor="#2D2E3F"
          backgroundColor="#292b2f"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color="#9CA3AF" fontSize={12} fontWeight="600" fontFamily={fontFamily}>New Document</Text>
            <TouchableOpacity onPress={() => { setShowCreate(false); setNewTitle(""); }}>
              <CloseIcon size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </XStack>
          <Input
            size="$3"
            placeholder="Document title..."
            value={newTitle}
            onChangeText={setNewTitle}
            backgroundColor="#2D2E3F"
            color="white"
            borderColor="#2D2E3F"
            fontFamily={fontFamily}
            // @ts-ignore
            placeholderTextColor="#6B7280"
          />
          <XStack gap="$2">
            <Button
              flex={1}
              size="$3"
              backgroundColor={createType === "document" ? "#0EA5E9" : "#2D2E3F"}
              onPress={() => setCreateType("document")}
              icon={<FileText size={14} color="white" />}
            >
              <Text color="white" fontSize={12} fontFamily={fontFamily}>Document</Text>
            </Button>
            <Button
              flex={1}
              size="$3"
              backgroundColor={createType === "whiteboard" ? "#10B981" : "#2D2E3F"}
              onPress={() => setCreateType("whiteboard")}
              icon={<PenTool size={14} color="white" />}
            >
              <Text color="white" fontSize={12} fontFamily={fontFamily}>Whiteboard</Text>
            </Button>
          </XStack>
          <Button
            size="$3"
            backgroundColor="#0EA5E9"
            onPress={handleCreate}
            pressStyle={{ backgroundColor: "#0284C7" }}
          >
            <Text color="white" fontSize={13} fontWeight="600" fontFamily={fontFamily}>Create</Text>
          </Button>
        </YStack>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
          <FileText size={40} color="#6B7280" />
          <Text color="#6B7280" fontSize={14} textAlign="center" marginTop="$2" fontFamily={fontFamily}>
            No documents yet
          </Text>
          <Text color="#6B7280" fontSize={12} textAlign="center" fontFamily={fontFamily}>
            Create one to get started
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 4 }}
        />
      )}
    </YStack>
  );
};

export default React.memo(DocumentListPanel);
