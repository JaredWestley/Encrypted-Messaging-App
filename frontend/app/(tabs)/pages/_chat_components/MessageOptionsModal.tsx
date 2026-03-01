import React from "react";
import { Card, XStack, YStack, Text } from "tamagui";
import { Modal, Pressable } from "react-native";
import { Edit3, Trash2 } from "@tamagui/lucide-icons";

interface MessageOptionsModalProps {
  visible: boolean;
  isMobile: boolean;
  isOwnMessage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const MessageOptionsModal: React.FC<MessageOptionsModalProps> = ({
  visible,
  isMobile,
  isOwnMessage,
  onClose,
  onEdit,
  onDelete,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
        onPress={onClose}
      >
        <Card
          backgroundColor="#2f3136"
          padding="$0"
          borderRadius="$4"
          width={isMobile ? "90%" : 200}
          maxWidth={300}
        >
          <YStack>
            {isOwnMessage && (
              <Pressable onPress={onEdit}>
                <XStack
                  padding={isMobile ? "$4" : "$3"}
                  gap="$3"
                  alignItems="center"
                >
                  <Edit3 size={isMobile ? 20 : 16} color="white" />
                  <Text color="white" fontSize={isMobile ? "$4" : "$3"}>Edit</Text>
                </XStack>
              </Pressable>
            )}
            <Pressable onPress={onDelete}>
              <XStack
                padding={isMobile ? "$4" : "$3"}
                gap="$3"
                alignItems="center"
              >
                <Trash2 size={isMobile ? 20 : 16} color="#f04747" />
                <Text color="#f04747" fontSize={isMobile ? "$4" : "$3"}>Delete</Text>
              </XStack>
            </Pressable>
          </YStack>
        </Card>
      </Pressable>
    </Modal>
  );
};

export default React.memo(MessageOptionsModal);
