import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Centralized configuration for API and WebSocket URLs.
 *
 * On web, we derive the host from window.location so that any device
 * on the LAN can reach the backend (which should be bound to 0.0.0.0:8000).
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

const HOST = getHost();
const API_PORT = 8000;

export const API_URL = `http://${HOST}:${API_PORT}/api`;
export const BASE_URL = `http://${HOST}:${API_PORT}`;
export const WS_BASE_URL = `ws://${HOST}:${API_PORT}`;
