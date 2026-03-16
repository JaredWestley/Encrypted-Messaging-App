import React from "react";
import { Card, XStack, YStack, Text } from "tamagui";
import { Modal, Pressable } from "react-native";
import { Edit3, Trash2, Sparkles, CornerUpLeft, SmilePlus } from "@tamagui/lucide-icons";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface MessageOptionsModalProps {
  visible: boolean;
  isMobile: boolean;
  isOwnMessage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSummarize: () => void;
  onReply?: () => void;
  onReact?: () => void;
}

const MessageOptionsModal: React.FC<MessageOptionsModalProps> = ({
  visible,
  isMobile,
  isOwnMessage,
  onClose,
  onEdit,
  onDelete,
  onSummarize,
  onReply,
  onReact,
}) => {
  const { fontFamily } = usePreferences();
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
          backgroundColor="#171823"
          padding="$0"
          borderRadius="$4"
          width={isMobile ? "90%" : 200}
          maxWidth={300}
        >
          <YStack>
            <Pressable onPress={onReply}>
              <XStack
                padding={isMobile ? "$4" : "$3"}
                gap="$3"
                alignItems="center"
              >
                <CornerUpLeft size={isMobile ? 20 : 16} color="white" />
                <Text color="white" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>Reply</Text>
              </XStack>
            </Pressable>
            <Pressable onPress={onReact}>
              <XStack
                padding={isMobile ? "$4" : "$3"}
                gap="$3"
                alignItems="center"
              >
                <SmilePlus size={isMobile ? 20 : 16} color="white" />
                <Text color="white" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>React</Text>
              </XStack>
            </Pressable>
            {isOwnMessage && (
              <Pressable onPress={onEdit}>
                <XStack
                  padding={isMobile ? "$4" : "$3"}
                  gap="$3"
                  alignItems="center"
                >
                  <Edit3 size={isMobile ? 20 : 16} color="white" />
                  <Text color="white" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>Edit</Text>
                </XStack>
              </Pressable>
            )}
            <Pressable onPress={onSummarize}>
              <XStack
                padding={isMobile ? "$4" : "$3"}
                gap="$3"
                alignItems="center"
              >
                <Sparkles size={isMobile ? 20 : 16} color="#A78BFA" />
                <Text color="#A78BFA" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>Summarize</Text>
              </XStack>
            </Pressable>
            <Pressable onPress={onDelete}>
              <XStack
                padding={isMobile ? "$4" : "$3"}
                gap="$3"
                alignItems="center"
              >
                <Trash2 size={isMobile ? 20 : 16} color="#EF4444" />
                <Text color="#EF4444" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>Delete</Text>
              </XStack>
            </Pressable>
          </YStack>
        </Card>
      </Pressable>
    </Modal>
  );
};

export default React.memo(MessageOptionsModal);
