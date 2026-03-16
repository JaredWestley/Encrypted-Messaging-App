import React from "react";
import { XStack, Text } from "tamagui";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface TypingIndicatorProps {
  typingUsers: Map<number, string>;
  isMobile: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers, isMobile }) => {
  const { fontFamily } = usePreferences();
  if (typingUsers.size === 0) return null;

  const names = Array.from(typingUsers.values());
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing...`;
  }

  return (
    <XStack
      paddingHorizontal={isMobile ? "$3" : "$4"}
      paddingVertical="$1"
      backgroundColor="#1E1F2B"
    >
      <Text color="#6B7280" fontSize="$2" fontStyle="italic" fontFamily={fontFamily}>
        {text}
      </Text>
    </XStack>
  );
};

export default React.memo(TypingIndicator);
