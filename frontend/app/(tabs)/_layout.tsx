import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';
import { AuthProvider } from '../../utils/AuthContext';
import config from "../../tamagui.config";
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TamaguiProvider config={config} defaultTheme="dark">
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#36393f" },
            }}
          />
        </AuthProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}