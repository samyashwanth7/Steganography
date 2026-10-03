"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_online?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

const TOKEN_KEY = "stego_auth_token";

/** Heartbeat interval — 2 minutes in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthState | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Persist / clear token --------------------------------------------------

  const persistToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // -- Fetch current user from token -----------------------------------------

  const fetchCurrentUser = useCallback(
    async (t: string): Promise<User | null> => {
      try {
        const res = await fetch(apiUrl("/api/users/me"), {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return null;
        return (await res.json()) as User;
      } catch {
        return null;
      }
    },
    []
  );

  // -- Heartbeat --------------------------------------------------------------

  const startHeartbeat = useCallback(
    (t: string) => {
      // Clear any previous interval
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);

      heartbeatRef.current = setInterval(async () => {
        try {
          await fetch(apiUrl("/api/users/me/heartbeat"), {
            method: "POST",
            headers: { Authorization: `Bearer ${t}` },
          });
        } catch {
          // Silently ignore heartbeat errors
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    []
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // -- Auth actions -----------------------------------------------------------

  const signIn = useCallback(
    async (email: string, password: string) => {
      const body = new URLSearchParams();
      body.append("username", email);
      body.append("password", password);

      const res = await fetch(apiUrl("/api/token"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as Record<string, string>).detail ?? "Sign-in failed"
        );
      }

      const data = await res.json();
      const accessToken: string = data.access_token;

      persistToken(accessToken);

      const currentUser = await fetchCurrentUser(accessToken);
      if (!currentUser) throw new Error("Failed to fetch user profile");

      setUser(currentUser);
      startHeartbeat(accessToken);
    },
    [persistToken, fetchCurrentUser, startHeartbeat]
  );

  const signUp = useCallback(
    async (
      firstName: string,
      lastName: string,
      email: string,
      password: string
    ) => {
      const res = await fetch(apiUrl("/api/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as Record<string, string>).detail ?? "Sign-up failed"
        );
      }

      // Automatically sign in after registration
      await signIn(email, password);
    },
    [signIn]
  );

  const signOut = useCallback(async () => {
    try {
      if (token) {
        await fetch(apiUrl("/api/users/me/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Ignore errors during logout
    } finally {
      stopHeartbeat();
      clearToken();
    }
  }, [token, stopHeartbeat, clearToken]);

  // -- Bootstrap on mount -----------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (!stored) {
        setLoading(false);
        return;
      }

      const currentUser = await fetchCurrentUser(stored);
      if (cancelled) return;

      if (currentUser) {
        setToken(stored);
        setUser(currentUser);
        startHeartbeat(stored);
      } else {
        // Token is invalid — clean up
        localStorage.removeItem(TOKEN_KEY);
      }

      setLoading(false);
    }

    bootstrap();

    return () => {
      cancelled = true;
      stopHeartbeat();
    };
  }, [fetchCurrentUser, startHeartbeat, stopHeartbeat]);

  // -- Memoised context value -------------------------------------------------

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, signIn, signUp, signOut }),
    [user, token, loading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
