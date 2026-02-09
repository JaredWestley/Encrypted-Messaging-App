// import { useAuth } from "./context/AuthContext";

const API_URL = "http://localhost:8000/api"; // change to your backend URL

interface User {
  id: number;
  username: string;
  email: string;
  icon_url: string; // 👈 Add this
}

interface ServerUser {
  id: number;
  username: string;
  icon_url: string; // 👈 Add this
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
  is_default?: boolean; // Add this line
}

export async function apiRequest<T>(url: string, options: RequestInit, logout: () => void): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 401) {
    logout();
    window.location.href = "/";
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


// ✅ Public functions (no token required)
export async function registerUser(username: string, email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw new Error("Registration failed");
  return res.json();
}

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
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



// ✅ Auth-protected functions (use apiRequest with logout handler)
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

export async function sendMessage(token: string, content: string, serverId: number, userId: number, logout: () => void) {
  console.log("Sending message with:", { content, serverId, userId });
  return apiRequest(`${API_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, server_id: serverId, user_id: userId }),
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
    body: JSON.stringify({ name, permissions: [] }), // ✅ Fix: include empty permissions
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
  isDefault: boolean = false // ✅ add this
): Promise<void> {
  await apiRequest(`${API_URL}/servers/${serverId}/roles/${roleId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, permissions, userIds, is_default: isDefault }), // ✅ send it
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
): Promise<{ detail: string; icon_url: string }> { // 👈 Type added here
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
