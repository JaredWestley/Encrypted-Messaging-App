// import { useAuth } from "./context/AuthContext";

import { API_URL } from "./config";

interface User {
  id: number;
  username: string;
  email: string;
  icon_url: string;
}

interface ServerUser {
  id: number;
  username: string;
  icon_url: string;
  created_at: string;
}

interface ServerInvite {
  id: number;
  token: string;
  server_id: number;
  created_by: number;
  created_at: string;
}

export interface Role {
  id: number;
  name: string;
  permissions: string[];
  users: { id: number; username: string }[];
  is_default?: boolean;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit,
  logout: () => void,
  refreshAccessToken?: () => Promise<boolean>
): Promise<T> {
  let res = await fetch(url, options);

  // If 401 and have a refresh function, try to refresh and retry once
  if (res.status === 401 && refreshAccessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Get the new token from secure storage and retry
      const { getSecureItem } = require("./secureStorage");
      const newToken = await getSecureItem("token");
      if (newToken && options.headers) {
        const newHeaders = { ...options.headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(url, { ...options, headers: newHeaders });
      }
    }
  }

  if (res.status === 401) {
    logout();
    throw new Error("Unauthorized - redirected to login");
  }

  if (res.status === 429) {
    throw new Error("You are being rate limited. Please slow down.");
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "API Error");
  }

  return res.json();
}


// Public functions (no token required)
export async function registerUser(username: string, email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || "Registration failed");
  }
  return res.json();
}

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || "Invalid username or password");
  }
  return res.json();
}

export async function fetchCurrentUser(
  token: string,
  logout: () => void
): Promise<User> {
  const res = await apiRequest(`${API_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);

  return res as User;
}


export async function updateUserSettings(
  data: {
    username?: string;
    email?: string;
    current_password?: string;
    new_password?: string;
  },
  token: string,
  logout: () => void
) {
  return apiRequest<{ detail: string; user: { id: number; username: string; email: string } }>(
    `${API_URL}/users/me`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    },
    logout
  );
}



// Auth-protected functions (use apiRequest with logout handler)
export async function fetchServers(token: string, logout: () => void) {
  return apiRequest(`${API_URL}/servers`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function fetchMessages(token: string, serverId: number, logout: () => void) {
  return apiRequest(`${API_URL}/messages?server_id=${serverId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function sendMessage(
  token: string,
  content: string,
  serverId: number,
  userId: number,
  logout: () => void,
  encryption?: { is_encrypted: boolean; nonce: string; sender_public_key: string; attachment_id?: number }
) {
  const body: any = { content, server_id: serverId, user_id: userId };
  if (encryption) {
    body.is_encrypted = encryption.is_encrypted;
    body.nonce = encryption.nonce;
    body.sender_public_key = encryption.sender_public_key;
    if (encryption.attachment_id) body.attachment_id = encryption.attachment_id;
  }
  return apiRequest(`${API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }, logout);
}

export async function createServer(token: string, name: string, logout: () => void) {
  return apiRequest(`${API_URL}/servers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  }, logout);
}

export async function updateMessage(
  token: string,
  messageId: number,
  content: string,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/messages/${messageId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  }, logout);
}

export async function deleteMessage(
  token: string,
  server_id: number,
  messageId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/messages/${messageId}?server_id=${server_id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
  console.log(server_id)
}

export async function fetchUsersInServer(
  token: string,
  serverId: number,
  logout: () => void
): Promise<ServerUser[]> {
  return apiRequest<ServerUser[]>(`${API_URL}/servers/${serverId}/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function leaveServer(
  token: string,
  serverId: number,
  logout: () => void
): Promise<void> {
  return apiRequest(`${API_URL}/servers/${serverId}/leave`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}


export async function generateInviteLink(
  token: string,
  serverId: number,
  logout: () => void
): Promise<ServerInvite> {
  return apiRequest(`${API_URL}/servers/${serverId}/generate-invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function getServerInvites(
  token: string,
  serverId: number,
  logout: () => void
): Promise<ServerInvite[]> {
  return apiRequest(`${API_URL}/servers/${serverId}/invites`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function deleteInvite(
  token: string,
  inviteToken: string,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest(`${API_URL}/invites/${inviteToken}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function joinServerWithInvite(
  token: string,
  inviteToken: string,
  logout: () => void
): Promise<void> {
  return apiRequest(`${API_URL}/invite/${inviteToken}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function fetchPermissions(token: string, logout: () => void): Promise<string[]> {
  return apiRequest(`${API_URL}/roles/permissions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}


export async function fetchRoles(
  token: string,
  serverId: number,
  logout: () => void
): Promise<Role[]> {
  return apiRequest(`${API_URL}/servers/${serverId}/roles`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function createRole(
  token: string,
  serverId: number,
  name: string,
  logout: () => void
): Promise<Role> {
  return apiRequest(`${API_URL}/servers/${serverId}/roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, permissions: [] }),
  }, logout);
}

export async function updateRole(
  token: string,
  serverId: number,
  roleId: number,
  name: string,
  permissions: string[],
  userIds: number[],
  logout: () => void,
  isDefault: boolean = false
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/roles/${roleId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, permissions, userIds, is_default: isDefault }),
  }, logout);
}

export async function deleteRole(
  token: string,
  serverId: number,
  roleId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/roles/${roleId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function fetchUserRoles(
  token: string,
  serverId: number,
  userId: number,
  logout: () => void
): Promise<Role[]> {
  return apiRequest(`${API_URL}/servers/${serverId}/users/${userId}/roles`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function assignRole(token: string, serverId: number, userId: number, roleId: number, logout: () => void) {
  return apiRequest(`${API_URL}/servers/${serverId}/roles/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  }, logout);
}

export async function unassignRole(token: string, serverId: number, userId: number, roleId: number, logout: () => void) {
  return apiRequest(`${API_URL}/servers/${serverId}/roles/unassign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  }, logout);
}


export async function kickUser(
  token: string,
  serverId: number,
  userId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/kick?user_id=${userId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function banUser(
  token: string,
  serverId: number,
  userId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/ban?user_id=${userId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function fetchBannedUsers(
  token: string,
  serverId: number,
  logout: () => void
): Promise<User[]> {
  return apiRequest(`${API_URL}/servers/${serverId}/banned-users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function unbanUser(
  token: string,
  serverId: number,
  userId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/unban?user_id=${userId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}


export async function renameServer(
  token: string,
  serverId: number,
  newName: string,
  logout: () => void
): Promise<{ detail: string; name: string }> {
  const response = await apiRequest(
    `${API_URL}/servers/${serverId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    },
    logout
  );

  // Assuming `apiRequest` returns a fetch-like Response object
  const data = response as { detail: string; name: string };
  return data;
}


export async function deleteServer(
  token: string,
  serverId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, logout);
}

export async function uploadUserIcon(
  formData: FormData,
  token: string,
  logout: () => void
): Promise<{ detail: string; icon_url: string }> {
  return apiRequest(`${API_URL}/users/me/icon`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }, logout);
}


export async function uploadServerIcon(
  formData: FormData,
  serverId: number,
  token: string,
  logout: () => void
): Promise<{ detail: string; icon_url: string }> {
  return apiRequest(`${API_URL}/servers/${serverId}/icon`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }, logout);
}

export interface FriendshipData {
  id: number;
  user_id: number;
  friend_id: number;
  status: string;
  created_at: string;
  friend: {
    id: number;
    username: string;
    icon_url?: string;
    created_at: string;
  };
}

export async function fetchFriends(token: string, logout: () => void): Promise<FriendshipData[]> {
  return apiRequest<FriendshipData[]>(`${API_URL}/friends`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function fetchFriendRequests(token: string, logout: () => void): Promise<FriendshipData[]> {
  return apiRequest<FriendshipData[]>(`${API_URL}/friends/requests`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function fetchPendingRequests(token: string, logout: () => void): Promise<FriendshipData[]> {
  return apiRequest<FriendshipData[]>(`${API_URL}/friends/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function sendFriendRequest(
  token: string,
  username: string,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/friends/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ friend_username: username }),
  }, logout);
}

export async function acceptFriendRequest(
  token: string,
  friendshipId: number,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/friends/${friendshipId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function rejectFriendRequest(
  token: string,
  friendshipId: number,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/friends/${friendshipId}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function removeFriend(
  token: string,
  friendId: number,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/friends/${friendId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export interface ConversationData {
  id: number;
  name?: string;
  is_group: boolean;
  created_at: string;
  members: {
    id: number;
    username: string;
    icon_url?: string;
    created_at: string;
  }[];
}

export async function createOrGetConversation(
  token: string,
  friendId: number,
  logout: () => void
): Promise<ConversationData> {
  return apiRequest<ConversationData>(`${API_URL}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ friend_id: friendId }),
  }, logout);
}

export interface DirectMessageData {
  id: number;
  conversation_id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
}

export async function fetchConversationMessages(
  token: string,
  conversationId: number,
  logout: () => void
): Promise<DirectMessageData[]> {
  return apiRequest<DirectMessageData[]>(`${API_URL}/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function sendDirectMessage(
  token: string,
  conversationId: number,
  content: string,
  logout: () => void,
  encryption?: { is_encrypted: boolean; nonce: string; sender_public_key: string; attachment_id?: number }
): Promise<DirectMessageData> {
  const body: any = { content };
  if (encryption) {
    body.is_encrypted = encryption.is_encrypted;
    body.nonce = encryption.nonce;
    body.sender_public_key = encryption.sender_public_key;
    if (encryption.attachment_id) body.attachment_id = encryption.attachment_id;
  }
  return apiRequest<DirectMessageData>(`${API_URL}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }, logout);
}

export async function editDirectMessage(
  token: string,
  conversationId: number,
  messageId: number,
  content: string,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/conversations/${conversationId}/messages/${messageId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  }, logout);
}

export async function deleteDirectMessage(
  token: string,
  conversationId: number,
  messageId: number,
  logout: () => void
): Promise<void> {
  await apiRequest(`${API_URL}/conversations/${conversationId}/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }, logout);
}

export async function syncDirectMessages(
  token: string,
  conversationId: number,
  lastMessageId: number,
  logout: () => void
): Promise<DirectMessageData[]> {
  return apiRequest<DirectMessageData[]>(
    `${API_URL}/conversations/${conversationId}/messages/sync?after_id=${lastMessageId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

export async function fetchConversations(
  token: string,
  logout: () => void
): Promise<ConversationData[]> {
  return apiRequest<ConversationData[]>(
    `${API_URL}/conversations`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

export async function syncMessages(
  token: string,
  serverId: number,
  lastMessageId: number,
  logout: () => void
): Promise<any[]> {
  return apiRequest<any[]>(
    `${API_URL}/messages/sync?server_id=${serverId}&after_id=${lastMessageId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}


// ─── Encryption Key Management ────────────────────────────────────

export async function uploadPublicKey(
  token: string,
  publicKey: string,
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/keys/public`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ public_key: publicKey }),
  }, logout);
}

export interface PublicKeyData {
  user_id: number;
  username: string;
  public_key: string | null;
}

export async function fetchPublicKey(
  token: string,
  userId: number,
  logout: () => void
): Promise<PublicKeyData> {
  return apiRequest<PublicKeyData>(
    `${API_URL}/keys/public/${userId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

export interface ServerKeyData {
  server_id: number;
  encrypted_key: string;
  nonce: string;
  encrypted_by: number | null;
}

export async function fetchServerKey(
  token: string,
  serverId: number,
  logout: () => void
): Promise<ServerKeyData> {
  return apiRequest<ServerKeyData>(
    `${API_URL}/keys/server/${serverId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

export async function uploadServerKeys(
  token: string,
  serverId: number,
  encryptedKeys: { user_id: number; encrypted_key: string; nonce: string }[],
  logout: () => void
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`${API_URL}/keys/server`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ server_id: serverId, encrypted_keys: encryptedKeys }),
  }, logout);
}

// ─── File Attachments ────────────────────────────────────────────

export interface AttachmentData {
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
  created_at?: string;
}

export async function uploadAttachment(
  formData: FormData,
  token: string,
  logout: () => void
): Promise<AttachmentData> {
  return apiRequest<AttachmentData>(`${API_URL}/attachments/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }, logout);
}

export async function downloadAttachment(
  attachmentId: number,
  token: string,
  logout: () => void
): Promise<{
  bytes: ArrayBuffer;
  nonce: string;
  fileKeyEncrypted?: string;
  fileKeyNonce?: string;
  mimeType: string;
  filename: string;
}> {
  const res = await fetch(`${API_URL}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    logout();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error("Failed to download attachment");
  }

  const bytes = await res.arrayBuffer();
  return {
    bytes,
    nonce: res.headers.get("X-Encryption-Nonce") || "",
    fileKeyEncrypted: res.headers.get("X-File-Key-Encrypted") || undefined,
    fileKeyNonce: res.headers.get("X-File-Key-Nonce") || undefined,
    mimeType: res.headers.get("X-Mime-Type") || "application/octet-stream",
    filename: res.headers.get("X-Original-Filename") || "download",
  };
}

export async function fetchServerMemberPublicKeys(
  token: string,
  serverId: number,
  logout: () => void
): Promise<PublicKeyData[]> {
  return apiRequest<PublicKeyData[]>(
    `${API_URL}/keys/server/${serverId}/members`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

// ─── Voice Channels ──────────────────────────────────────────────

export interface VoiceChannelData {
  id: number;
  server_id: number;
  name: string;
  position: number;
  user_limit: number;
  connected_users: Array<{ id: number; username: string; icon_url?: string | null }>;
}

export async function fetchVoiceChannels(
  token: string,
  serverId: number,
  logout: () => void
): Promise<VoiceChannelData[]> {
  return apiRequest<VoiceChannelData[]>(
    `${API_URL}/servers/${serverId}/voice-channels`,
    { headers: { Authorization: `Bearer ${token}` } },
    logout
  );
}

export async function createVoiceChannel(
  token: string,
  serverId: number,
  name: string,
  userLimit: number = 8,
  logout: () => void
): Promise<VoiceChannelData> {
  return apiRequest<VoiceChannelData>(
    `${API_URL}/servers/${serverId}/voice-channels`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, user_limit: userLimit }),
    },
    logout
  );
}

export async function deleteVoiceChannel(
  token: string,
  channelId: number,
  logout: () => void
): Promise<void> {
  await apiRequest<any>(
    `${API_URL}/voice-channels/${channelId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
    logout
  );
}
