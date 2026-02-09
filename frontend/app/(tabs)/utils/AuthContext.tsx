// app/_utils/AuthContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage'; 

interface AuthContextType {
  token: string | null;
  username: string | null;
  userId: number | null;
  login: (token: string, username: string, userId: number) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  const login = async (newToken: string, user: string, userId: number) => {
    console.log(userId);
    console.log(newToken);
    console.log(user);
    setToken(newToken);
    setUsername(user);
    setUserId(userId);
    await AsyncStorage.setItem("token", newToken);
    await AsyncStorage.setItem("username", user);
    await AsyncStorage.setItem("userId", String(userId));
  };

  const logout = async () => {
    setToken(null);
    setUsername(null);
    setUserId(null);
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("username");
    await AsyncStorage.removeItem("userId");
  };

  useEffect(() => {
    const loadAuth = async () => {
      const savedToken = await AsyncStorage.getItem("token");
      const savedUser = await AsyncStorage.getItem("username");
      const savedId = await AsyncStorage.getItem("userId");
      if (savedToken && savedUser && savedId) {
        setToken(savedToken);
        setUsername(savedUser);
        setUserId(Number(savedId));
      }
    };
    loadAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, userId, login, logout }}>
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