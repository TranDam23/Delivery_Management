"use client";

import type { AuthenticatedUser } from "@delivery/shared";
import { useEffect, useSyncExternalStore } from "react";
import { ApiError, apiFetch, clearAuth, getToken, subscribeAuthToken, updateStoredUser } from "@/lib/api-client";

interface SessionState {
  token: string | null;
  user: AuthenticatedUser | null;
  error: boolean;
}

const EMPTY_SESSION: SessionState = { token: null, user: null, error: false };
const RECHECK_INTERVAL_MS = 60_000;
let currentSession: SessionState = EMPTY_SESSION;
let lastVerifiedAt = 0;
const listeners = new Set<() => void>();

function readSession(): SessionState { return currentSession; }
function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setSession(next: SessionState | ((current: SessionState) => SessionState)): void {
  currentSession = typeof next === "function" ? next(currentSession) : next;
  listeners.forEach((listener) => listener());
}

/** The login response is already authenticated; avoid an immediate duplicate /me request. */
export function primeAuthSession(token: string, user: AuthenticatedUser): void {
  lastVerifiedAt = Date.now();
  setSession({ token, user, error: false });
}

/** Root layout persists between menu links, so a verified user stays available during navigation. */
export function AuthSessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const token = useSyncExternalStore(subscribeAuthToken, getToken, () => null);

  useEffect(() => {
    if (!token) {
      lastVerifiedAt = 0;
      setSession(EMPTY_SESSION);
      return;
    }

    let active = true;
    let checking = false;
    const abortController = new AbortController();
    async function verifySession(): Promise<void> {
      if (!active || checking || getToken() !== token) return;
      if (currentSession.token === token && currentSession.user && Date.now() - lastVerifiedAt < RECHECK_INTERVAL_MS) return;

      // A different token must never inherit the previous user's role.
      setSession((current) => current.token === token
        ? { ...current, error: false }
        : { token, user: null, error: false });
      checking = true;
      try {
        const { user } = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/me", { cache: "no-store", signal: abortController.signal });
        if (!active || getToken() !== token) return;
        lastVerifiedAt = Date.now();
        updateStoredUser(user);
        setSession({ token, user, error: false });
      } catch (error) {
        if (!active || getToken() !== token) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          lastVerifiedAt = 0;
          clearAuth();
          setSession(EMPTY_SESSION);
          return;
        }
        // A temporary network/server failure is not proof that the session expired.
        setSession((current) => current.token === token ? { ...current, error: true } : current);
      } finally {
        checking = false;
      }
    }

    void verifySession();
    const timer = window.setInterval(() => { if (!document.hidden) void verifySession(); }, RECHECK_INTERVAL_MS);
    const onVisibilityChange = () => { if (!document.hidden) void verifySession(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      abortController.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token]);

  return <>{children}</>;
}

export function useAuthSession(): { session: SessionState; retry: () => void } {
  const session = useSyncExternalStore(subscribeSession, readSession, () => EMPTY_SESSION);
  return { session, retry: () => window.location.reload() };
}
