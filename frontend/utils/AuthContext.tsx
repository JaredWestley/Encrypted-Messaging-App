// app/_utils/AuthContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { setSecureItem, getSecureItem, deleteSecureItem } from "./secureStorage";

import { API_URL } from "./config";

interface AuthContextType {
  token: string | null;
  username: string | null;
  userId: number | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, username: string, userId: number) => void;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = async (accessToken: string, refreshToken: string, user: string, id: number) => {
    setToken(accessToken);
    setUsername(user);
    setUserId(id);
    await setSecureItem("token", accessToken);
    await setSecureItem("refreshToken", refreshToken);
    await setSecureItem("username", user);
    await setSecureItem("userId", String(id));
  };

  // Clear local state + storage without contacting the server
  const clearLocalAuth = useCallback(async () => {
    setToken(null);
    setUsername(null);
    setUserId(null);
    await deleteSecureItem("token");
    await deleteSecureItem("refreshToken");
    await deleteSecureItem("username");
    await deleteSecureItem("userId");
  }, []);

  // Full logout: blacklist the token on the server, then clear locally
  const logout = useCallback(async () => {
    const currentToken = token || (await getSecureItem("token"));
    if (currentToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // Server unreachable — still clear locally
      }
    }
    await clearLocalAuth();
  }, [token, clearLocalAuth]);

  // Exchange refresh token for a new access token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = await getSecureItem("refreshToken");
    if (!refreshToken) {
      await clearLocalAuth();
      return false;
    }

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        await clearLocalAuth();
        return false;
      }

      const data = await res.json();
      setToken(data.access_token);
      await setSecureItem("token", data.access_token);
      return true;
    } catch {
      await clearLocalAuth();
      return false;
    }
  }, [clearLocalAuth]);

  // Load saved auth state on app start
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const savedToken = await getSecureItem("token");
        const savedRefresh = await getSecureItem("refreshToken");
        const savedUser = await getSecureItem("username");
        const savedId = await getSecureItem("userId");

        if (savedToken && savedUser && savedId) {
          setToken(savedToken);
          setUsername(savedUser);
          setUserId(Number(savedId));
        } else if (savedRefresh) {
          // Access token expired but refresh token exists — try refreshing
          const success = await refreshAccessToken();
          if (success && savedUser && savedId) {
            setUsername(savedUser);
            setUserId(Number(savedId));
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, userId, isLoading, login, logout, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
