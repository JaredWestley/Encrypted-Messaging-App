import { HOST } from "./config";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: `turn:${HOST}:3478`,
    username: "EncryptedMessAppStunUsername",
    credential: "EncryptedMessAppStunPass",
  },
];
