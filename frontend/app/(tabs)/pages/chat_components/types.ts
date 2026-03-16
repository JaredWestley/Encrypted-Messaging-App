import React from "react";

export interface MessageAttachment {
  id: number;
  original_filename: string;
  mime_type: string;
  file_size: number;
  encryption_nonce: string;
  file_key_encrypted?: string | null;
  file_key_nonce?: string | null;
  sender_file_key_encrypted?: string | null;
  sender_file_key_nonce?: string | null;
  uploader_id?: number;
}

export interface Message {
  id: number;
  username: string;
  content: string;
  user_id: number;
  timestamp: string;
  reply_to?: { id: number; content: string; username: string; user_id: number } | null;
  reactions?: { emoji: string; count: number; users: { user_id: number; username: string }[] }[];
  attachment?: MessageAttachment | null;
  _encrypted?: boolean;
  _rawContent?: string;
  _rawNonce?: string;
  _senderPublicKey?: string;
}

export interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
  slow_mode_seconds?: number;
}

export interface User {
  id: number;
  username: string;
}

export interface ImageDecryptContext {
  token: string | null;
  logout: () => void;
  isDmMode: boolean;
  activeConversation: any;
  userId: number | null;
  myKeyPairRef: React.RefObject<any>;
  selectedServerRef: React.RefObject<any>;
  getServerKey: (serverId: number) => Promise<Uint8Array | null>;
  fetchAndCacheServerKey: (serverId: number) => Promise<any>;
  handleDownloadAttachment: (attachment: MessageAttachment) => void;
}

export default function Types() {
  return null;
}