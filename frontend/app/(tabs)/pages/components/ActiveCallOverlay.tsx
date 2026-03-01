import React, { useRef, useEffect } from "react";
import { Platform, StyleSheet } from "react-native";
import { YStack, XStack, Text, Button } from "tamagui";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Minimize2 } from "@tamagui/lucide-icons";
import type { CallState, AudioDevice } from "../../../../utils/useWebRTC";
import AudioSettingsPanel from "./AudioSettingsPanel";

// Conditionally import RTCView for native
let RTCView: any = null;
if (Platform.OS !== "web") {
  try {
    RTCView = require("react-native-webrtc").RTCView;
  } catch {}
}

interface ActiveCallOverlayProps {
  callState: CallState;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  minimized: boolean;
  onToggleMinimize: () => void;
  audioDevices?: AudioDevice[];
  selectedMicId?: string;
  selectedSpeakerId?: string;
  onSelectMic?: (deviceId: string) => void;
  onSelectSpeaker?: (deviceId: string) => void;
  onRefreshDevices?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ─── Minimized Voice Bar ─────────────────────────────────────────
function MinimizedCallBar({
  callState,
  onHangUp,
  onToggleMute,
  onToggleMinimize,
}: {
  callState: CallState;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleMinimize: () => void;
}) {
  const minimizedAudioRef = useRef<HTMLAudioElement>(null);

  // For voice calls in minimized mode, need audio playback on web
  useEffect(() => {
    if (Platform.OS === "web" && callState.callType === "voice" && minimizedAudioRef.current && callState.remoteStream) {
      minimizedAudioRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream, callState.callType]);

  return (
    <>
    {/* Audio for minimized voice calls on web */}
    {Platform.OS === "web" && callState.callType === "voice" && (
      <audio ref={minimizedAudioRef as any} autoPlay playsInline style={{ display: "none" } as any} />
    )}
    <XStack
      backgroundColor="#43B581"
      paddingHorizontal="$3"
      paddingVertical="$2"
      alignItems="center"
      justifyContent="space-between"
      pressStyle={{ opacity: 0.9 }}
      onPress={onToggleMinimize}
    >
      <XStack alignItems="center" gap="$2" flex={1}>
        <Phone size={16} color="white" />
        <Text color="white" fontSize={14} fontWeight="600">
          {callState.remoteUsername || "Call"}
        </Text>
        <Text color="rgba(255,255,255,0.8)" fontSize={13}>
          {formatDuration(callState.callDuration)}
        </Text>
      </XStack>
      <XStack gap="$2">
        <Button
          size="$2"
          circular
          backgroundColor={callState.isMuted ? "#ED4245" : "rgba(255,255,255,0.2)"}
          onPress={(e: any) => { e.stopPropagation?.(); onToggleMute(); }}
          icon={callState.isMuted ? <MicOff size={14} color="white" /> : <Mic size={14} color="white" />}
        />
        <Button
          size="$2"
          circular
          backgroundColor="#ED4245"
          onPress={(e: any) => { e.stopPropagation?.(); onHangUp(); }}
          icon={<PhoneOff size={14} color="white" />}
        />
      </XStack>
    </XStack>
    </>
  );
}

// ─── Full-screen Video Call ──────────────────────────────────────
function VideoCallView({
  callState,
  onHangUp,
  onToggleMute,
  onToggleVideo,
  onToggleMinimize,
  audioDevices,
  selectedMicId,
  selectedSpeakerId,
  onSelectMic,
  onSelectSpeaker,
  onRefreshDevices,
}: ActiveCallOverlayProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Web: attach streams to video elements
  useEffect(() => {
    if (Platform.OS === "web" && remoteVideoRef.current && callState.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  useEffect(() => {
    if (Platform.OS === "web" && localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState.localStream]);

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="#000"
      zIndex={1000}
    >
      {/* Remote video (full screen) */}
      {Platform.OS === "web" ? (
        <video
          ref={remoteVideoRef as any}
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" } as any}
        />
      ) : (
        callState.remoteStream && RTCView ? (
          <RTCView
            streamURL={(callState.remoteStream as any).toURL()}
            style={styles.fullVideo}
            objectFit="cover"
          />
        ) : (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <Text color="#b9bbbe" fontSize={16}>Connecting video...</Text>
          </YStack>
        )
      )}

      {/* Local video (PiP) */}
      <YStack
        position="absolute"
        top={60}
        right={16}
        width={120}
        height={160}
        borderRadius={12}
        overflow="hidden"
        borderWidth={2}
        borderColor="rgba(255,255,255,0.3)"
      >
        {Platform.OS === "web" ? (
          <video
            ref={localVideoRef as any}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" } as any}
          />
        ) : (
          callState.localStream && RTCView ? (
            <RTCView
              streamURL={(callState.localStream as any).toURL()}
              style={styles.fullVideo}
              objectFit="cover"
              mirror
            />
          ) : null
        )}
      </YStack>

      {/* Top bar: name + duration + minimize */}
      <XStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        paddingTop={50}
        paddingHorizontal="$4"
        paddingBottom="$3"
        justifyContent="space-between"
        alignItems="center"
      >
        <YStack>
          <Text color="white" fontSize={18} fontWeight="700">
            {callState.remoteUsername || "Call"}
          </Text>
          <Text color="rgba(255,255,255,0.7)" fontSize={14}>
            {formatDuration(callState.callDuration)}
          </Text>
        </YStack>
        <Button
          size="$3"
          circular
          backgroundColor="rgba(255,255,255,0.2)"
          onPress={onToggleMinimize}
          icon={<Minimize2 size={18} color="white" />}
        />
      </XStack>

      {/* Bottom controls */}
      <XStack
        position="absolute"
        bottom={40}
        left={0}
        right={0}
        justifyContent="center"
        gap="$5"
      >
        <YStack alignItems="center" gap="$1">
          <Button
            size="$5"
            circular
            backgroundColor={callState.isMuted ? "#ED4245" : "rgba(255,255,255,0.2)"}
            onPress={onToggleMute}
            icon={callState.isMuted ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
          />
          <Text color="rgba(255,255,255,0.7)" fontSize={11}>
            {callState.isMuted ? "Unmute" : "Mute"}
          </Text>
        </YStack>

        <YStack alignItems="center" gap="$1">
          <Button
            size="$5"
            circular
            backgroundColor={!callState.isVideoEnabled ? "#ED4245" : "rgba(255,255,255,0.2)"}
            onPress={onToggleVideo}
            icon={callState.isVideoEnabled ? <Video size={24} color="white" /> : <VideoOff size={24} color="white" />}
          />
          <Text color="rgba(255,255,255,0.7)" fontSize={11}>
            {callState.isVideoEnabled ? "Stop Video" : "Start Video"}
          </Text>
        </YStack>

        {/* Audio settings gear */}
        {audioDevices && onSelectMic && onSelectSpeaker && onRefreshDevices && (
          <YStack alignItems="center" gap="$1" justifyContent="center" paddingTop="$2">
            <AudioSettingsPanel
              audioDevices={audioDevices}
              selectedMicId={selectedMicId || ""}
              selectedSpeakerId={selectedSpeakerId || ""}
              onSelectMic={onSelectMic}
              onSelectSpeaker={onSelectSpeaker}
              onRefreshDevices={onRefreshDevices}
            />
            <Text color="rgba(255,255,255,0.7)" fontSize={11}>
              Audio
            </Text>
          </YStack>
        )}

        <YStack alignItems="center" gap="$1">
          <Button
            size="$5"
            circular
            backgroundColor="#ED4245"
            pressStyle={{ backgroundColor: "#c0392b" }}
            onPress={onHangUp}
            icon={<PhoneOff size={24} color="white" />}
          />
          <Text color="rgba(255,255,255,0.7)" fontSize={11}>
            End
          </Text>
        </YStack>
      </XStack>
    </YStack>
  );
}

// ─── Full-screen Voice Call ──────────────────────────────────────
function VoiceCallView({
  callState,
  onHangUp,
  onToggleMute,
  onToggleMinimize,
  audioDevices,
  selectedMicId,
  selectedSpeakerId,
  onSelectMic,
  onSelectSpeaker,
  onRefreshDevices,
}: Omit<ActiveCallOverlayProps, "onToggleVideo">) {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Web: attach remote stream to a hidden <audio> element so we can hear them
  useEffect(() => {
    if (Platform.OS === "web" && remoteAudioRef.current && callState.remoteStream) {
      remoteAudioRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  // Apply speaker selection via setSinkId
  useEffect(() => {
    if (Platform.OS === "web" && remoteAudioRef.current && selectedSpeakerId) {
      const el = remoteAudioRef.current as any;
      if (typeof el.setSinkId === "function") {
        el.setSinkId(selectedSpeakerId).catch(() => {});
      }
    }
  }, [selectedSpeakerId]);

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="#2f3136"
      zIndex={1000}
      justifyContent="center"
      alignItems="center"
    >
      {/* Audio element for web voice playback */}
      {Platform.OS === "web" && (
        <audio ref={remoteAudioRef as any} autoPlay playsInline style={{ display: "none" } as any} />
      )}

      {/* Minimize */}
      <Button
        position="absolute"
        top={50}
        right={16}
        size="$3"
        circular
        backgroundColor="rgba(255,255,255,0.1)"
        onPress={onToggleMinimize}
        icon={<Minimize2 size={18} color="white" />}
      />

      {/* Avatar placeholder */}
      <YStack
        width={100}
        height={100}
        borderRadius={50}
        backgroundColor="#5865F2"
        justifyContent="center"
        alignItems="center"
        marginBottom="$4"
      >
        <Text color="white" fontSize={36} fontWeight="700">
          {(callState.remoteUsername || "?")[0].toUpperCase()}
        </Text>
      </YStack>

      <Text color="white" fontSize={22} fontWeight="700" marginBottom="$2">
        {callState.remoteUsername || "Call"}
      </Text>
      <Text color="#b9bbbe" fontSize={16} marginBottom="$10">
        {formatDuration(callState.callDuration)}
      </Text>

      {/* Controls */}
      <XStack gap="$6" alignItems="flex-start">
        <YStack alignItems="center" gap="$1">
          <Button
            size="$5"
            circular
            backgroundColor={callState.isMuted ? "#ED4245" : "rgba(255,255,255,0.15)"}
            onPress={onToggleMute}
            icon={callState.isMuted ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
          />
          <Text color="rgba(255,255,255,0.7)" fontSize={11}>
            {callState.isMuted ? "Unmute" : "Mute"}
          </Text>
        </YStack>

        {/* Audio settings gear */}
        {Platform.OS === "web" && audioDevices && onSelectMic && onSelectSpeaker && onRefreshDevices && (
          <YStack alignItems="center" gap="$1" justifyContent="center" paddingTop="$2">
            <AudioSettingsPanel
              audioDevices={audioDevices}
              selectedMicId={selectedMicId || ""}
              selectedSpeakerId={selectedSpeakerId || ""}
              onSelectMic={onSelectMic}
              onSelectSpeaker={onSelectSpeaker}
              onRefreshDevices={onRefreshDevices}
            />
            <Text color="rgba(255,255,255,0.7)" fontSize={11}>
              Audio
            </Text>
          </YStack>
        )}

        <YStack alignItems="center" gap="$1">
          <Button
            size="$5"
            circular
            backgroundColor="#ED4245"
            pressStyle={{ backgroundColor: "#c0392b" }}
            onPress={onHangUp}
            icon={<PhoneOff size={24} color="white" />}
          />
          <Text color="rgba(255,255,255,0.7)" fontSize={11}>
            End
          </Text>
        </YStack>
      </XStack>
    </YStack>
  );
}

// ─── Main Export ──────────────────────────────────────────────────
export default function ActiveCallOverlay(props: ActiveCallOverlayProps) {
  const { callState, minimized } = props;

  // Minimized bar for both voice and video
  if (minimized && callState.status === "connected") {
    return (
      <MinimizedCallBar
        callState={callState}
        onHangUp={props.onHangUp}
        onToggleMute={props.onToggleMute}
        onToggleMinimize={props.onToggleMinimize}
      />
    );
  }

  // Full-screen view
  if (callState.status === "connected" || callState.status === "calling") {
    if (callState.callType === "video") {
      return <VideoCallView {...props} />;
    }
    return <VoiceCallView {...props} />;
  }

  return null;
}

const styles = StyleSheet.create({
  fullVideo: {
    width: "100%",
    height: "100%",
  },
});
