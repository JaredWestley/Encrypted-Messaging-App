import React, { createContext, useContext, useState, ReactNode } from "react";

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

  const login = (newToken: string, user: string, userId: number) => {
    console.log(userId);
    console.log(newToken);
    console.log(user);
    setToken(newToken);
    setUsername(user);
    setUserId(userId);
    localStorage.setItem("token", newToken);
    localStorage.setItem("username", user);
    localStorage.setItem("userId", String(userId));
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    setUserId(null);
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
  };

React.useEffect(() => {
  const savedToken = localStorage.getItem("token");
  const savedUser = localStorage.getItem("username");
  const savedId = localStorage.getItem("userId");
  if (savedToken && savedUser && savedId) {
    setToken(savedToken);
    setUsername(savedUser);
    setUserId(Number(savedId));
  }
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
