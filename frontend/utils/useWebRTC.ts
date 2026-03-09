import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";

// ─── Platform-specific WebRTC imports ────────────────────────────
let RTPCClass: any;
let mediaDevicesAPI: any;
let RTCSessionDescClass: any;
let RTCIceCandidateClass: any;
let RTCViewComponent: any = null;
let InCallManager: any = null;

if (Platform.OS !== "web") {
  const webrtc = require("react-native-webrtc");
  RTPCClass = webrtc.RTCPeerConnection;
  mediaDevicesAPI = webrtc.mediaDevices;
  RTCSessionDescClass = webrtc.RTCSessionDescription;
  RTCIceCandidateClass = webrtc.RTCIceCandidate;
  RTCViewComponent = webrtc.RTCView;
  // InCallManager handles iOS audio session (earpiece/speaker routing)
  try {
    InCallManager = require("react-native-incall-manager").default;
  } catch {
    console.warn("[WebRTC] react-native-incall-manager not available");
  }
} else {
  RTPCClass = typeof window !== "undefined" ? (window as any).RTCPeerConnection : undefined;
  mediaDevicesAPI = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  RTCSessionDescClass = typeof window !== "undefined" ? (window as any).RTCSessionDescription : undefined;
  RTCIceCandidateClass = typeof window !== "undefined" ? (window as any).RTCIceCandidate : undefined;
}

export { RTCViewComponent };

// ─── Audio Device Types ──────────────────────────────────────────
export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
}

// ─── Types ────────────────────────────────────────────────────────
export interface CallState {
  status: "idle" | "calling" | "ringing" | "connected" | "ended";
  callId: string | null;
  callType: "voice" | "video";
  remoteUserId: number | null;
  remoteUsername: string | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callDuration: number;
}

export interface SignalingMessage {
  type: string;
  from_user_id?: number;
  from_username?: string;
  offer?: string;
  answer?: string;
  candidate?: any;
  call_type?: "voice" | "video";
  call_id?: string;
}

export interface UseWebRTCOptions {
  userId: number;
  iceServers: RTCIceServer[];
  // Called when need to send signaling messages over WS
  sendOffer: (toUserId: number, offer: string, callType: "voice" | "video", callId: string) => void;
  sendAnswer: (toUserId: number, answer: string, callId: string) => void;
  sendIceCandidate: (toUserId: number, candidate: any, callId: string) => void;
  sendReject: (toUserId: number, callId: string) => void;
  sendHangup: (toUserId: number, callId: string) => void;
}

const INITIAL_STATE: CallState = {
  status: "idle",
  callId: null,
  callType: "voice",
  remoteUserId: null,
  remoteUsername: null,
  isMuted: false,
  isVideoEnabled: true,
  localStream: null,
  remoteStream: null,
  callDuration: 0,
};

function generateCallId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "call-" + Date.now() + "-" + Math.random().toString(36).substring(2, 10);
}

// ─── Hook ─────────────────────────────────────────────────────────
export function useWebRTC({
  userId,
  iceServers,
  sendOffer,
  sendAnswer,
  sendIceCandidate,
  sendReject,
  sendHangup,
}: UseWebRTCOptions) {
  const [callState, setCallState] = useState<CallState>(INITIAL_STATE);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<any[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>(INITIAL_STATE);

  // Keep ref in sync with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Store the pending offer for callee to use when accepting
  const pendingOfferRef = useRef<string | null>(null);

  // ─── Internal helpers ───────────────────────────────────────────

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = setInterval(() => {
      setCallState((prev) => ({ ...prev, callDuration: prev.callDuration + 1 }));
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const cleanupCall = useCallback(() => {
    stopDurationTimer();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    pendingOfferRef.current = null;
    // Stop InCallManager on native (release audio session)
    if (Platform.OS !== "web" && InCallManager) {
      try {
        InCallManager.stop();
      } catch {}
    }
  }, [stopDurationTimer]);

  const getMediaStream = useCallback(async (callType: "voice" | "video") => {
    if (!mediaDevicesAPI || !mediaDevicesAPI.getUserMedia) {
      throw new Error(
        "Camera/microphone access is not available. " +
        "WebRTC requires a secure context (HTTPS or localhost). " +
        "If you're accessing from another device, use HTTPS."
      );
    }

    // Build platform-appropriate constraints
    const videoConstraint = callType === "video"
      ? (Platform.OS === "web"
        ? { facingMode: "user" }
        : { facingMode: { ideal: "user" } }) // Native needs `ideal` instead of exact string
      : false;

    const constraints = {
      audio: true,
      video: videoConstraint,
    };

    try {
      const stream = await mediaDevicesAPI.getUserMedia(constraints);
      return stream as MediaStream;
    } catch (err: any) {
      // If video fails (e.g., iOS simulator with no camera), fall back to audio-only
      if (callType === "video" && err?.name !== "NotAllowedError") {
        console.warn("[WebRTC] Video not available, falling back to audio-only:", err?.message);
        try {
          const audioOnlyStream = await mediaDevicesAPI.getUserMedia({ audio: true, video: false });
          return audioOnlyStream as MediaStream;
        } catch (audioErr) {
          throw audioErr;
        }
      }
      throw err;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTPCClass({ iceServers }) as RTCPeerConnection;

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        const state = callStateRef.current;
        if (state.remoteUserId && state.callId) {
          sendIceCandidate(state.remoteUserId, event.candidate.toJSON(), state.callId);
        }
      }
    };

    pc.ontrack = (event: RTCTrackEvent) => {
      const stream = event.streams[0];
      if (stream) {
        remoteStreamRef.current = stream;
        setCallState((prev) => ({ ...prev, remoteStream: stream }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        // Remote peer disconnected
        const state = callStateRef.current;
        if (state.status === "connected" || state.status === "calling") {
          cleanupCall();
          setCallState({ ...INITIAL_STATE, status: "ended" });
        }
      }
    };

    return pc;
  }, [iceServers, sendIceCandidate, cleanupCall]);

  const flushPendingCandidates = useCallback(async () => {
    if (!pcRef.current) return;
    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    for (const c of candidates) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidateClass(c));
      } catch (err) {
        console.warn("[WebRTC] Failed to add buffered ICE candidate:", err);
      }
    }
  }, []);

  // ─── InCallManager helper ─────────────────────────────────────
  const startInCallManager = useCallback((callType: "voice" | "video") => {
    if (Platform.OS !== "web" && InCallManager) {
      try {
        // Start audio session — 'video' uses speaker, 'voice' uses earpiece
        InCallManager.start({ media: callType === "video" ? "video" : "audio" });
        // For voice calls, default to speakerphone for better experience
        if (callType === "voice") {
          InCallManager.setForceSpeakerphoneOn(true);
        }
        console.log(`[WebRTC] InCallManager started for ${callType}`);
      } catch (err) {
        console.warn("[WebRTC] InCallManager.start failed:", err);
      }
    }
  }, []);

  // ─── Public API ─────────────────────────────────────────────────

  const startCall = useCallback(
    async (remoteUserId: number, remoteUsername: string, callType: "voice" | "video") => {
      if (callStateRef.current.status !== "idle") return;

      const callId = generateCallId();
      let stream: MediaStream;
      try {
        stream = await getMediaStream(callType);
      } catch (err: any) {
        console.error("[WebRTC] Failed to get media stream:", err);
        setCallState({ ...INITIAL_STATE, status: "ended" });
        setTimeout(() => setCallState(INITIAL_STATE), 3000);
        throw err;
      }
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Create and set offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === "video",
      } as any);
      await pc.setLocalDescription(offer);

      setCallState({
        ...INITIAL_STATE,
        status: "calling",
        callId,
        callType,
        remoteUserId,
        remoteUsername,
        isVideoEnabled: callType === "video",
        localStream: stream,
      });

      // Start InCallManager for native audio session
      startInCallManager(callType);

      // Send offer via signaling
      sendOffer(remoteUserId, JSON.stringify(offer), callType, callId);
    },
    [getMediaStream, createPeerConnection, sendOffer, startInCallManager]
  );

  const acceptCall = useCallback(async () => {
    const state = callStateRef.current;
    if (state.status !== "ringing" || !pendingOfferRef.current || !state.remoteUserId || !state.callId) return;

    let stream: MediaStream;
    try {
      stream = await getMediaStream(state.callType);
    } catch (err: any) {
      console.error("[WebRTC] Failed to get media stream for accept:", err);
      // Reject the call since we can't get media
      sendReject(state.remoteUserId, state.callId);
      cleanupCall();
      setCallState(INITIAL_STATE);
      throw err;
    }
    localStreamRef.current = stream;

    const pc = createPeerConnection();
    pcRef.current = pc;

    // Add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Set remote offer
    const offerDesc = new RTCSessionDescClass(JSON.parse(pendingOfferRef.current));
    await pc.setRemoteDescription(offerDesc);

    // Flush any ICE candidates that arrived before we set remote description
    await flushPendingCandidates();

    // Create and set answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    setCallState((prev) => ({
      ...prev,
      status: "connected",
      localStream: stream,
      callDuration: 0,
    }));
    startDurationTimer();

    // Start InCallManager for native audio session
    startInCallManager(state.callType);

    // Send answer via signaling
    sendAnswer(state.remoteUserId, JSON.stringify(answer), state.callId);
  }, [getMediaStream, createPeerConnection, flushPendingCandidates, sendAnswer, startDurationTimer, startInCallManager]);

  const rejectCall = useCallback(() => {
    const state = callStateRef.current;
    if (state.status !== "ringing" || !state.remoteUserId || !state.callId) return;

    sendReject(state.remoteUserId, state.callId);
    cleanupCall();
    setCallState(INITIAL_STATE);
  }, [sendReject, cleanupCall]);

  const hangUp = useCallback(() => {
    const state = callStateRef.current;
    if (state.remoteUserId && state.callId) {
      sendHangup(state.remoteUserId, state.callId);
    }
    cleanupCall();
    setCallState(INITIAL_STATE);
  }, [sendHangup, cleanupCall]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallState((prev) => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCallState((prev) => ({ ...prev, isVideoEnabled: videoTrack.enabled }));
      }
    }
  }, []);

  // ─── Handle incoming signaling messages ─────────────────────────

  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      const state = callStateRef.current;

      switch (msg.type) {
        case "call_offer": {
          if (state.status !== "idle") {
            // Already in a call — auto-reject (busy)
            if (msg.from_user_id && msg.call_id) {
              sendReject(msg.from_user_id, msg.call_id);
            }
            return;
          }
          // Store offer for when user accepts
          pendingOfferRef.current = msg.offer || null;
          setCallState({
            ...INITIAL_STATE,
            status: "ringing",
            callId: msg.call_id || null,
            callType: msg.call_type || "voice",
            remoteUserId: msg.from_user_id || null,
            remoteUsername: msg.from_username || null,
            isVideoEnabled: msg.call_type === "video",
          });
          break;
        }

        case "call_answer": {
          if (state.status !== "calling" || !pcRef.current) return;
          const answerDesc = new RTCSessionDescClass(JSON.parse(msg.answer!));
          await pcRef.current.setRemoteDescription(answerDesc);
          await flushPendingCandidates();

          setCallState((prev) => ({
            ...prev,
            status: "connected",
            callDuration: 0,
          }));
          startDurationTimer();
          break;
        }

        case "call_ice_candidate": {
          if (msg.candidate) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidateClass(msg.candidate));
              } catch (err) {
                console.warn("[WebRTC] Failed to add ICE candidate:", err);
              }
            } else {
              // Buffer until remote description is set
              pendingCandidatesRef.current.push(msg.candidate);
            }
          }
          break;
        }

        case "call_reject": {
          if (state.status === "calling") {
            cleanupCall();
            setCallState({ ...INITIAL_STATE, status: "ended" });
            // Reset to idle after a brief delay so UI can show "call rejected"
            setTimeout(() => setCallState(INITIAL_STATE), 2000);
          }
          break;
        }

        case "call_hangup": {
          cleanupCall();
          setCallState({ ...INITIAL_STATE, status: "ended" });
          setTimeout(() => setCallState(INITIAL_STATE), 2000);
          break;
        }
      }
    },
    [sendReject, flushPendingCandidates, startDurationTimer, cleanupCall]
  );

  // ─── Audio Device Management ───────────────────────────────────

  const enumerateAudioDevices = useCallback(async () => {
    if (!mediaDevicesAPI || !mediaDevicesAPI.enumerateDevices) return;
    try {
      const devices = await mediaDevicesAPI.enumerateDevices();
      const audioList: AudioDevice[] = (devices as MediaDeviceInfo[])
        .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || (d.kind === "audioinput" ? `Microphone ${d.deviceId.slice(0, 6)}` : `Speaker ${d.deviceId.slice(0, 6)}`),
          kind: d.kind as "audioinput" | "audiooutput",
        }));
      setAudioDevices(audioList);
    } catch (err) {
      console.warn("[WebRTC] Failed to enumerate devices:", err);
    }
  }, []);

  // Enumerate devices when a call starts (after permission grant)
  useEffect(() => {
    if (callState.status === "connected" || callState.status === "calling") {
      enumerateAudioDevices();
    }
  }, [callState.status, enumerateAudioDevices]);

  const switchMicrophone = useCallback(async (deviceId: string) => {
    if (!localStreamRef.current || !mediaDevicesAPI) return;
    try {
      const newStream = await mediaDevicesAPI.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      const newAudioTrack = (newStream as MediaStream).getAudioTracks()[0];
      if (!newAudioTrack) return;

      // Replace track in local stream
      const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
      if (oldAudioTrack) {
        // Preserve muted state
        newAudioTrack.enabled = oldAudioTrack.enabled;
        localStreamRef.current.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
      }
      localStreamRef.current.addTrack(newAudioTrack);

      // Replace track in peer connection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        }
      }
      setSelectedMicId(deviceId);
    } catch (err) {
      console.warn("[WebRTC] Failed to switch microphone:", err);
    }
  }, []);

  const switchSpeaker = useCallback(async (deviceId: string) => {
    // Speaker selection only works on web via HTMLAudioElement.setSinkId()
    // Store the preference and the component will apply it to audio elements
    setSelectedSpeakerId(deviceId);
  }, []);

  // Toggle speakerphone on native (uses InCallManager)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const toggleSpeaker = useCallback(() => {
    if (Platform.OS !== "web" && InCallManager) {
      const newState = !isSpeakerOn;
      try {
        InCallManager.setForceSpeakerphoneOn(newState);
        setIsSpeakerOn(newState);
      } catch (err) {
        console.warn("[WebRTC] Failed to toggle speaker:", err);
      }
    }
  }, [isSpeakerOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    callState,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleVideo,
    handleSignalingMessage,
    audioDevices,
    selectedMicId,
    selectedSpeakerId,
    enumerateAudioDevices,
    switchMicrophone,
    switchSpeaker,
    toggleSpeaker,
    isSpeakerOn,
  };
}
