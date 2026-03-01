import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";

// ─── Platform-specific WebRTC imports ────────────────────────────
let RTPCClass: any;
let mediaDevicesAPI: any;
let RTCSessionDescClass: any;
let RTCIceCandidateClass: any;

if (Platform.OS !== "web") {
  const webrtc = require("react-native-webrtc");
  RTPCClass = webrtc.RTCPeerConnection;
  mediaDevicesAPI = webrtc.mediaDevices;
  RTCSessionDescClass = webrtc.RTCSessionDescription;
  RTCIceCandidateClass = webrtc.RTCIceCandidate;
} else {
  RTPCClass = typeof window !== "undefined" ? (window as any).RTCPeerConnection : undefined;
  mediaDevicesAPI = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  RTCSessionDescClass = typeof window !== "undefined" ? (window as any).RTCSessionDescription : undefined;
  RTCIceCandidateClass = typeof window !== "undefined" ? (window as any).RTCIceCandidate : undefined;
}

// ─── Types ────────────────────────────────────────────────────────

export interface VoiceChannelUser {
  user_id: number;
  username: string;
}

export interface VoiceChannelState {
  channelId: number | null;
  isConnected: boolean;
  isMuted: boolean;
  users: VoiceChannelUser[];
}

interface PeerState {
  pc: RTCPeerConnection;
  pendingCandidates: any[];
}

export interface UseVoiceChannelOptions {
  userId: number;
  iceServers: RTCIceServer[];
  sendVoiceJoin: (channelId: number) => void;
  sendVoiceLeave: (channelId: number) => void;
  sendVoiceOffer: (channelId: number, toUserId: number, offer: any) => void;
  sendVoiceAnswer: (channelId: number, toUserId: number, answer: any) => void;
  sendVoiceIceCandidate: (channelId: number, toUserId: number, candidate: any) => void;
}

const INITIAL_STATE: VoiceChannelState = {
  channelId: null,
  isConnected: false,
  isMuted: false,
  users: [],
};

// ─── Hook ─────────────────────────────────────────────────────────

export function useVoiceChannel({
  userId,
  iceServers,
  sendVoiceJoin,
  sendVoiceLeave,
  sendVoiceOffer,
  sendVoiceAnswer,
  sendVoiceIceCandidate,
}: UseVoiceChannelOptions) {
  const [state, setState] = useState<VoiceChannelState>(INITIAL_STATE);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, PeerState>>(new Map());
  const stateRef = useRef<VoiceChannelState>(INITIAL_STATE);
  const remoteAudiosRef = useRef<Map<number, MediaStream>>(new Map());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─── Internal helpers ───────────────────────────────────────────

  const createPeerConnection = useCallback(
    (remoteUserId: number): RTCPeerConnection => {
      const pc = new RTPCClass({ iceServers }) as RTCPeerConnection;

      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate && stateRef.current.channelId) {
          sendVoiceIceCandidate(
            stateRef.current.channelId,
            remoteUserId,
            event.candidate.toJSON()
          );
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        const stream = event.streams[0];
        if (stream) {
          remoteAudiosRef.current.set(remoteUserId, stream);
          // On web, create an audio element to play the remote stream
          if (Platform.OS === "web" && typeof document !== "undefined") {
            const existingEl = document.getElementById(`voice-audio-${remoteUserId}`);
            if (existingEl) existingEl.remove();
            const audioEl = document.createElement("audio");
            audioEl.id = `voice-audio-${remoteUserId}`;
            audioEl.srcObject = stream;
            audioEl.autoplay = true;
            audioEl.style.display = "none";
            document.body.appendChild(audioEl);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          // Peer dropped — clean up their connection
          removePeer(remoteUserId);
        }
      };

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      return pc;
    },
    [iceServers, sendVoiceIceCandidate]
  );

  const removePeer = useCallback((remoteUserId: number) => {
    const peer = peersRef.current.get(remoteUserId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(remoteUserId);
    }
    remoteAudiosRef.current.delete(remoteUserId);
    // Remove audio element on web
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const el = document.getElementById(`voice-audio-${remoteUserId}`);
      if (el) el.remove();
    }
  }, []);

  const cleanupAll = useCallback(() => {
    peersRef.current.forEach((peer) => peer.pc.close());
    peersRef.current.clear();
    remoteAudiosRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    // Remove all audio elements on web
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.querySelectorAll('[id^="voice-audio-"]').forEach((el) => el.remove());
    }
  }, []);

  // ─── Mesh: initiate connection to a single user ─────────────────

  const connectToPeer = useCallback(
    async (remoteUserId: number) => {
      if (peersRef.current.has(remoteUserId)) return;
      const channelId = stateRef.current.channelId;
      if (!channelId) return;

      const pc = createPeerConnection(remoteUserId);
      peersRef.current.set(remoteUserId, { pc, pendingCandidates: [] });

      const offer = await pc.createOffer({ offerToReceiveAudio: true } as any);
      await pc.setLocalDescription(offer);

      sendVoiceOffer(channelId, remoteUserId, JSON.stringify(offer));
    },
    [createPeerConnection, sendVoiceOffer]
  );

  // ─── Public API ─────────────────────────────────────────────────

  const joinChannel = useCallback(
    async (channelId: number) => {
      if (!mediaDevicesAPI || !mediaDevicesAPI.getUserMedia) {
        throw new Error(
          "Microphone access is not available. " +
          "WebRTC requires a secure context (HTTPS or localhost). " +
          "If you're accessing from another device, use HTTPS."
        );
      }
      // Acquire microphone
      const constraints = { audio: true, video: false };
      const stream = await mediaDevicesAPI.getUserMedia(constraints);
      localStreamRef.current = stream as MediaStream;

      setState({
        channelId,
        isConnected: true,
        isMuted: false,
        users: [],
      });

      sendVoiceJoin(channelId);
    },
    [sendVoiceJoin]
  );

  const leaveChannel = useCallback(() => {
    const channelId = stateRef.current.channelId;
    if (channelId) {
      sendVoiceLeave(channelId);
    }
    cleanupAll();
    setState(INITIAL_STATE);
  }, [sendVoiceLeave, cleanupAll]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setState((prev) => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  }, []);

  // ─── Signaling handlers (called from useWebSocket callbacks) ────

  const handleVoiceUserJoined = useCallback(
    (channelId: number, joinedUserId: number, username: string) => {
      if (channelId !== stateRef.current.channelId) return;
      setState((prev) => ({
        ...prev,
        users: [...prev.users.filter((u) => u.user_id !== joinedUserId), { user_id: joinedUserId, username }],
      }));
      // Initiate a peer connection to the new user
      if (joinedUserId !== userId) {
        connectToPeer(joinedUserId);
      }
    },
    [userId, connectToPeer]
  );

  const handleVoiceUserLeft = useCallback(
    (channelId: number, leftUserId: number) => {
      if (channelId !== stateRef.current.channelId) return;
      removePeer(leftUserId);
      setState((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.user_id !== leftUserId),
      }));
    },
    [removePeer]
  );

  const handleVoiceChannelUsers = useCallback(
    (channelId: number, users: VoiceChannelUser[]) => {
      if (channelId !== stateRef.current.channelId) return;
      setState((prev) => ({ ...prev, users }));
      // Connect to every existing user in the channel
      for (const u of users) {
        if (u.user_id !== userId) {
          connectToPeer(u.user_id);
        }
      }
    },
    [userId, connectToPeer]
  );

  const handleVoiceOffer = useCallback(
    async (channelId: number, fromUserId: number, _fromUsername: string, offerStr: any) => {
      if (channelId !== stateRef.current.channelId) return;

      // If there's already have a connection to this user, close it first
      removePeer(fromUserId);

      const pc = createPeerConnection(fromUserId);
      peersRef.current.set(fromUserId, { pc, pendingCandidates: [] });

      const offer = new RTCSessionDescClass(JSON.parse(offerStr));
      await pc.setRemoteDescription(offer);

      // Flush buffered candidates
      const peer = peersRef.current.get(fromUserId);
      if (peer && peer.pendingCandidates.length > 0) {
        for (const c of peer.pendingCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidateClass(c));
          } catch (err) {
            console.warn("[VoiceChannel] Failed to add buffered ICE candidate:", err);
          }
        }
        peer.pendingCandidates = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendVoiceAnswer(channelId, fromUserId, JSON.stringify(answer));
    },
    [createPeerConnection, removePeer, sendVoiceAnswer]
  );

  const handleVoiceAnswer = useCallback(
    async (channelId: number, fromUserId: number, answerStr: any) => {
      if (channelId !== stateRef.current.channelId) return;
      const peer = peersRef.current.get(fromUserId);
      if (!peer) return;

      const answer = new RTCSessionDescClass(JSON.parse(answerStr));
      await peer.pc.setRemoteDescription(answer);

      // Flush buffered candidates
      if (peer.pendingCandidates.length > 0) {
        for (const c of peer.pendingCandidates) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidateClass(c));
          } catch (err) {
            console.warn("[VoiceChannel] Failed to add buffered ICE candidate:", err);
          }
        }
        peer.pendingCandidates = [];
      }
    },
    []
  );

  const handleVoiceIceCandidate = useCallback(
    async (channelId: number, fromUserId: number, candidate: any) => {
      if (channelId !== stateRef.current.channelId) return;
      const peer = peersRef.current.get(fromUserId);
      if (!peer) return;

      if (peer.pc.remoteDescription) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidateClass(candidate));
        } catch (err) {
          console.warn("[VoiceChannel] Failed to add ICE candidate:", err);
        }
      } else {
        peer.pendingCandidates.push(candidate);
      }
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  return {
    voiceState: state,
    joinChannel,
    leaveChannel,
    toggleMute: toggleMute,
    handleVoiceUserJoined,
    handleVoiceUserLeft,
    handleVoiceChannelUsers,
    handleVoiceOffer,
    handleVoiceAnswer,
    handleVoiceIceCandidate,
  };
}
