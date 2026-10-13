"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "./types";
import { api, setAccessToken, ApiError } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  loginWithOtp: (email: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  loginWithOtp: async () => false,
  logout: async () => {},
  refreshUser: async () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initAuth = async () => {
    try {
      const res = await api.refreshSession();
      setAccessToken(res.access_token);
      setUser(res.user);
    } catch (err) {
      // If refresh fails, try /me if token in memory or stay logged out
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const loginWithOtp = async (email: string, otp: string): Promise<boolean> => {
    const res = await api.verifyOtp(email, otp);
    setAccessToken(res.access_token);
    setUser(res.user);
    return res.is_new_user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    } finally {
      setAccessToken(null);
      setUser(null);
      window.location.href = "/login";
    }
  };

  const refreshUser = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginWithOtp,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
