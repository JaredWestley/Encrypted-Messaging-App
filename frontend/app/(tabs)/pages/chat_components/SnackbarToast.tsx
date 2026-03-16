import React from "react";
import { Card, Text } from "tamagui";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface SnackbarToastProps {
  visible: boolean;
  message: string;
  bottomInset: number;
  isMobile: boolean;
}

const SnackbarToast: React.FC<SnackbarToastProps> = ({
  visible,
  message,
  bottomInset,
  isMobile,
}) => {
  const { fontFamily } = usePreferences();
  if (!visible) return null;

  return (
    <Card
      position="absolute"
      bottom={bottomInset + 20}
      alignSelf="center"
      backgroundColor="#252636"
      padding={isMobile ? "$4" : "$3"}
      borderRadius="$4"
      marginHorizontal="$4"
      maxWidth={isMobile ? "90%" : 400}
      shadowColor="black"
      shadowOffset={{ width: 0, height: 4 }}
      shadowOpacity={0.3}
      shadowRadius={8}
    >
      <Text color="white" fontSize={isMobile ? "$4" : "$3"} fontFamily={fontFamily}>{message}</Text>
    </Card>
  );
};

export default React.memo(SnackbarToast);
