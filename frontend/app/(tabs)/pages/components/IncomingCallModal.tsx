import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable } from "react-native";
import { XStack, Text } from "tamagui";
import { Phone, PhoneOff, Video } from "@tamagui/lucide-icons";
import { usePreferences } from "../../../../utils/PreferencesContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface IncomingCallModalProps {
  visible: boolean;
  callerName: string;
  callType: "voice" | "video";
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({
  visible,
  callerName,
  callType,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  const { fontFamily } = usePreferences();
  const insets = useSafeAreaInsets();
  // Slide-down animation
  const slideAnim = useRef(new Animated.Value(-120)).current;
  // Subtle pulse on the pill
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Slide in from above
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      // Pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 800, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.ease, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      // Slide out
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim, pulseAnim]);

  if (!visible) return null;

  const topOffset = Platform.OS === "web" ? 12 : insets.top + 4;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: topOffset,
        left: 0,
        right: 0,
        zIndex: 9999,
        alignItems: "center",
        transform: [{ translateY: slideAnim }, { scale: pulseAnim }],
      }}
      pointerEvents="box-none"
    >
      <Pressable
        style={{
          backgroundColor: "#1a1a2e",
          borderRadius: 28,
          paddingVertical: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 10,
          borderWidth: 1,
          borderColor: "rgba(88, 101, 242, 0.3)",
          maxWidth: 380,
          width: "90%",
        }}
      >
        {/* Call type icon */}
        <XStack
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor="#0EA5E9"
          justifyContent="center"
          alignItems="center"
        >
          {callType === "video" ? (
            <Video size={18} color="white" />
          ) : (
            <Phone size={18} color="white" />
          )}
        </XStack>

        {/* Caller info */}
        <XStack flex={1} flexDirection="column" gap={1}>
          <Text color="white" fontSize={14} fontWeight="700" numberOfLines={1} fontFamily={fontFamily}>
            {callerName}
          </Text>
          <Text color="#8e9297" fontSize={11} fontFamily={fontFamily}>
            Incoming {callType} call
          </Text>
        </XStack>

        {/* Decline button */}
        <Pressable
          onPress={onReject}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#EF4444",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <PhoneOff size={16} color="white" />
        </Pressable>

        {/* Accept button */}
        <Pressable
          onPress={onAccept}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#10B981",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Phone size={16} color="white" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
