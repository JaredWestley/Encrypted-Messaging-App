import { Platform } from "react-native";
import Constants from "expo-constants";

/* ── Docker runtime config injection ─────────────────────────── */
declare global {
  interface Window {
    __DOCKER_ENV__?: {
      API_URL: string;
      BASE_URL: string;
      WS_BASE_URL: string;
    };
  }
}

/**
 * Centralized configuration for API and WebSocket URLs.
 *
 * Priority:
 *  1. Docker runtime injection (window.__DOCKER_ENV__ set by nginx env-config.js)
 *  2. Hardcoded production URLs (fallback)
 *
 * On native (iOS/Android via Expo Go), we extract the host IP from
 * Constants.expoConfig.hostUri which Expo sets to "<IP>:<metroPort>".
 * We swap the metro port for the backend port (8000).
 *
 * Fallback: localhost (for running on the same machine).
 */
function getHost(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location) {
      return window.location.hostname;
    }
    return "localhost";
  }

  // Native: Expo sets hostUri to something like "192.168.1.10:8081"
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host) return host;
  }

  return "localhost";
}

export const HOST = getHost();
const API_PORT = 8000;

// Docker runtime injection takes priority, then hardcoded production URLs
const dockerEnv =
  typeof window !== "undefined" ? window.__DOCKER_ENV__ : undefined;

export const API_URL = `http://${HOST}:${API_PORT}/api`;
export const BASE_URL = `http://${HOST}:${API_PORT}`;
export const WS_BASE_URL = `ws://${HOST}:${API_PORT}`;

// Log the resolved URLs on startup to diagnose iOS networking issues
console.log(`[Config] Platform=${Platform.OS}, HOST=${HOST}, API_URL=${API_URL}`);
