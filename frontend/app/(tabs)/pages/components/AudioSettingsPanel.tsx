import React, { useState } from "react";
import { Platform, Pressable, Modal } from "react-native";
import { YStack, XStack, Text, Separator, Button } from "tamagui";
import { Settings, Mic, Volume2, Check, X } from "@tamagui/lucide-icons";
import { usePreferences } from "../../../../utils/PreferencesContext";
import type { AudioDevice } from "../../../../utils/useWebRTC";

interface AudioSettingsPanelProps {
  audioDevices: AudioDevice[];
  selectedMicId: string;
  selectedSpeakerId: string;
  onSelectMic: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
  onRefreshDevices: () => void;
}

export default function AudioSettingsPanel({
  audioDevices,
  selectedMicId,
  selectedSpeakerId,
  onSelectMic,
  onSelectSpeaker,
  onRefreshDevices,
}: AudioSettingsPanelProps) {
  const { fontFamily } = usePreferences();
  const [visible, setVisible] = useState(false);

  const microphones = audioDevices.filter((d) => d.kind === "audioinput");
  const speakers = audioDevices.filter((d) => d.kind === "audiooutput");

  if (Platform.OS !== "web") {
    // Native platforms don't seem to support device selection with JS
    return null;
  }

  return (
    <>
      {/* Settings gear button */}
      <YStack alignItems="center" gap="$1" marginTop="$-2">
      <Button
          size="$5"
          circular
          backgroundColor={"rgba(255,255,255,0.15)"}
          onPress={() => {
            onRefreshDevices();
            setVisible(true);
          }}
          icon={<Settings size={24} color="white" />}
        />
      </YStack>

      {/* Device selection modal */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: "#171823",
              borderRadius: 12,
              padding: 20,
              minWidth: 320,
              maxWidth: 420,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 16,
              elevation: 12,
              borderWidth: 1,
              borderColor: "#2D2E3F",
            }}
            onPress={(e) => e.stopPropagation?.()}
          >
            {/* Header */}
            <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
              <Text color="white" fontSize={16} fontWeight="700" fontFamily={fontFamily}>
                Audio Settings
              </Text>
              <Pressable
                onPress={() => setVisible(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <X size={14} color="#9CA3AF" />
              </Pressable>
            </XStack>

            {/* Microphone section */}
            <XStack alignItems="center" gap={8} marginBottom={8}>
              <Mic size={14} color="#9CA3AF" />
              <Text color="#9CA3AF" fontSize={12} fontWeight="600" textTransform="uppercase" fontFamily={fontFamily}>
                Microphone
              </Text>
            </XStack>
            <YStack gap={4} marginBottom={16}>
              {microphones.length === 0 ? (
                <Text color="#6B7280" fontSize={13} fontFamily={fontFamily}>No microphones found</Text>
              ) : (
                microphones.map((device) => {
                  const isSelected = device.deviceId === selectedMicId ||
                    (!selectedMicId && device.deviceId === "default");
                  return (
                    <Pressable
                      key={device.deviceId}
                      onPress={() => onSelectMic(device.deviceId)}
                      style={{
                        backgroundColor: isSelected ? "rgba(88, 101, 242, 0.2)" : "rgba(255,255,255,0.05)",
                        borderRadius: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? "#0EA5E9" : "transparent",
                      }}
                    >
                      <Text
                        color={isSelected ? "white" : "#D1D5DB"}
                        fontSize={13}
                        numberOfLines={1}
                        style={{ flex: 1 }}
                        fontFamily={fontFamily}
                      >
                        {device.label}
                      </Text>
                      {isSelected && <Check size={14} color="#0EA5E9" />}
                    </Pressable>
                  );
                })
              )}
            </YStack>

            <Separator backgroundColor="#2D2E3F" marginBottom={16} />

            {/* Speaker section */}
            <XStack alignItems="center" gap={8} marginBottom={8}>
              <Volume2 size={14} color="#9CA3AF" />
              <Text color="#9CA3AF" fontSize={12} fontWeight="600" textTransform="uppercase" fontFamily={fontFamily}>
                Speaker
              </Text>
            </XStack>
            <YStack gap={4}>
              {speakers.length === 0 ? (
                <Text color="#6B7280" fontSize={13} fontFamily={fontFamily}>
                  Speaker selection not available
                </Text>
              ) : (
                speakers.map((device) => {
                  const isSelected = device.deviceId === selectedSpeakerId ||
                    (!selectedSpeakerId && device.deviceId === "default");
                  return (
                    <Pressable
                      key={device.deviceId}
                      onPress={() => onSelectSpeaker(device.deviceId)}
                      style={{
                        backgroundColor: isSelected ? "rgba(88, 101, 242, 0.2)" : "rgba(255,255,255,0.05)",
                        borderRadius: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? "#0EA5E9" : "transparent",
                      }}
                    >
                      <Text
                        color={isSelected ? "white" : "#D1D5DB"}
                        fontSize={13}
                        numberOfLines={1}
                        style={{ flex: 1 }}
                        fontFamily={fontFamily}
                      >
                        {device.label}
                      </Text>
                      {isSelected && <Check size={14} color="#0EA5E9" />}
                    </Pressable>
                  );
                })
              )}
            </YStack>

            {/* Info text */}
            <Text color="#6B7280" fontSize={11} marginTop={12} fontFamily={fontFamily}>
              Speaker selection applies to audio/video elements via setSinkId.
              {"\n"}Microphone changes take effect immediately during the call.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
