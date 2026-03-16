import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';
import { useFonts } from 'expo-font';
import { Asset } from 'expo-asset';
import { AuthProvider } from '../../utils/AuthContext';
import { PreferencesProvider } from '../../utils/PreferencesContext';
import config from "../../tamagui.config";
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const dyslexicFontModule = require('../../assets/fonts/OpenDyslexic-Regular.otf');

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    OpenDyslexic: dyslexicFontModule,
  });

  // Inject global CSS
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const style = window.document.createElement('style');

    let fontFaceRule = '';
    try {
      const asset = Asset.fromModule(dyslexicFontModule);
      const fontUrl = asset.uri || asset.localUri || '';
      if (fontUrl) {
        fontFaceRule = `
          @font-face {
            font-family: "OpenDyslexic";
            src: url("${fontUrl}") format("opentype");
            font-display: swap;
          }
        `;
      }
    } catch (e) {
      console.warn('Failed to resolve OpenDyslexic font asset:', e);
    }

    style.textContent = `
      ${fontFaceRule}
      *:focus-visible { outline: 2px solid #0EA5E9; outline-offset: 2px; }
    `;
    window.document.head.appendChild(style);
    return () => { window.document.head.removeChild(style); };
  }, []);

  return (
    <SafeAreaProvider>
      <TamaguiProvider config={config} defaultTheme="dark">
        <AuthProvider>
          <PreferencesProvider fontsLoaded={fontsLoaded}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#1E1F2B" },
              }}
            />
          </PreferencesProvider>
        </AuthProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}