import React from "react";
import { View } from "react-native";
import { Check, Clock, Minus, X } from "@tamagui/lucide-icons";
import { usePreferences } from "../../../../utils/PreferencesContext";

type Status = "online" | "offline" | "away" | "dnd";

interface StatusIndicatorProps {
  status: Status;
  size?: number;
}

const STATUS_COLORS: Record<Status, string> = {
  online: "#10B981",
  away: "#F59E0B",
  dnd: "#EF4444",
  offline: "#747f8d",
};

const STATUS_ICONS: Record<Status, React.FC<{ size: number; color: string }>> = {
  online: Check,
  away: Clock,
  dnd: Minus,
  offline: X,
};

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, size = 12 }) => {
  const { colorBlindMode } = usePreferences();
  const color = STATUS_COLORS[status];
  const IconComponent = STATUS_ICONS[status];
  const iconSize = Math.round(size * 0.6);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: "#171823",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {colorBlindMode && (
        <IconComponent size={iconSize} color="white" />
      )}
    </View>
  );
};

export default React.memo(StatusIndicator);
