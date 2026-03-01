import React from "react";
import { XStack, Text } from "tamagui";

interface TypingIndicatorProps {
  typingUsers: Map<number, string>;
  isMobile: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers, isMobile }) => {
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
      backgroundColor="#36393f"
    >
      <Text color="#72767d" fontSize="$2" fontStyle="italic">
        {text}
      </Text>
    </XStack>
  );
};

export default React.memo(TypingIndicator);
