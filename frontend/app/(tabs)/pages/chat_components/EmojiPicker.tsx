import React from "react";
import { YStack, XStack, Text } from "tamagui";
import { Modal, Pressable, TouchableOpacity } from "react-native";
import { usePreferences } from "../../../../utils/PreferencesContext";

const EMOJIS = [
  "\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F525}", "\u{1F44F}", "\u{1F62E}", "\u{1F622}", "\u{1F389}",
  "\u{1F914}", "\u{1F440}", "\u{1F680}", "\u{1F4AF}", "\u2705", "\u274C", "\u{1F64F}", "\u{1F4AA}",
  "\u{1F60D}", "\u{1F923}", "\u{1F60A}", "\u{1F44E}", "\u{1F480}", "\u{1FAE1}", "\u2B50", "\u{1F49C}",
];

interface EmojiPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  usedEmojis?: string[];
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ visible, onClose, onSelect, usedEmojis = [] }) => {
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
        <Pressable onPress={(e) => e.stopPropagation()}>
          <YStack
            backgroundColor="#171823"
            borderRadius="$4"
            padding="$3"
            width={280}
          >
            <Text color="white" fontWeight="700" fontSize="$4" marginBottom="$2" fontFamily={fontFamily}>
              Pick a Reaction
            </Text>
            <XStack flexWrap="wrap" gap="$1" justifyContent="center">
              {EMOJIS.map((emoji) => {
                const alreadyUsed = usedEmojis.includes(emoji);
                return (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => {
                      if (!alreadyUsed) {
                        onSelect(emoji);
                        onClose();
                      }
                    }}
                    disabled={alreadyUsed}
                    style={{
                      width: 44,
                      height: 44,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 8,
                      opacity: alreadyUsed ? 0.3 : 1,
                      backgroundColor: alreadyUsed ? "#2D2E3F" : "transparent",
                    }}
                  >
                    <Text fontSize={24} fontFamily={fontFamily}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </XStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default React.memo(EmojiPicker);
