import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "accessibility_prefs";

type FontSize = "small" | "medium" | "large";

interface PreferencesState {
  fontSize: FontSize;
  dyslexiaFont: boolean;
  colorBlindMode: boolean;
}

interface PreferencesContextValue extends PreferencesState {
  setFontSize: (size: FontSize) => void;
  setDyslexiaFont: (enabled: boolean) => void;
  setColorBlindMode: (enabled: boolean) => void;
  fontSizeValue: number;
  fontFamily: string;
}

const FONT_SIZE_MAP: Record<FontSize, number> = {
  small: 13,
  medium: 15,
  large: 18,
};

const ZOOM_MAP: Record<FontSize, number> = {
  small: 0.9,
  medium: 1.0,
  large: 1.15,
};

// The default Tamagui body font stack — used when dyslexia mode is off
const DEFAULT_FONT_FAMILY = 'Inter, -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const defaults: PreferencesState = {
  fontSize: "medium",
  dyslexiaFont: false,
  colorBlindMode: false,
};

const PreferencesContext = createContext<PreferencesContextValue>({
  ...defaults,
  setFontSize: () => {},
  setDyslexiaFont: () => {},
  setColorBlindMode: () => {},
  fontSizeValue: FONT_SIZE_MAP.medium,
  fontFamily: DEFAULT_FONT_FAMILY,
});

export function PreferencesProvider({ children, fontsLoaded }: { children: React.ReactNode; fontsLoaded: boolean }) {
  const [prefs, setPrefs] = useState<PreferencesState>(defaults);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setPrefs((prev) => ({ ...prev, ...parsed }));
        } catch {
          // ignore
        }
      }
      setPrefsLoaded(true);
    });
  }, []);

  // Update global <style> on web for font-family and font-size zoom
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // Don't inject CSS until saved preferences are loaded from storage
    if (!prefsLoaded) return;

    // Clean up any stale style elements from previous mounts
    const stale = document.querySelectorAll('style[data-prefs="global-font"]');
    stale.forEach((el) => {
      if (el !== styleRef.current) el.remove();
    });

    if (!styleRef.current) {
      styleRef.current = document.createElement("style");
      styleRef.current.setAttribute("data-prefs", "global-font");
      document.head.appendChild(styleRef.current);
    }

    // Dyslexia font rule
    const useDyslexia = prefs.dyslexiaFont && fontsLoaded;
    const fontFamilyRule = useDyslexia
      ? `* { font-family: "OpenDyslexic"; }`
      : "";

    // Font size via CSS zoom on the root element
    const zoomValue = ZOOM_MAP[prefs.fontSize];
    const zoomRule = zoomValue !== 1.0
      ? `html { zoom: ${zoomValue}; }`
      : "";

    styleRef.current.textContent = [fontFamilyRule, zoomRule].filter(Boolean).join("\n");
  }, [prefs.dyslexiaFont, prefs.fontSize, fontsLoaded, prefsLoaded]);

  // Clean up style tag on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS === "web" && styleRef.current) {
        styleRef.current.remove();
      }
    };
  }, []);

  const setFontSize = useCallback((size: FontSize) => {
    setPrefs((prev) => {
      const next = { ...prev, fontSize: size };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setDyslexiaFont = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, dyslexiaFont: enabled };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setColorBlindMode = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, colorBlindMode: enabled };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value: PreferencesContextValue = {
    ...prefs,
    setFontSize,
    setDyslexiaFont,
    setColorBlindMode,
    fontSizeValue: FONT_SIZE_MAP[prefs.fontSize],
    fontFamily: prefs.dyslexiaFont && fontsLoaded ? "OpenDyslexic" : DEFAULT_FONT_FAMILY,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
