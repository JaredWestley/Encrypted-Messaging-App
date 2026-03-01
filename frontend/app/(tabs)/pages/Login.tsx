import React, { useState } from "react";
import {
  YStack,
  XStack,
  Text,
  Input,
  Button,
  Card,
  Theme,
  Spinner,
} from "tamagui";
import { KeyboardAvoidingView, Platform } from "react-native";
import { User, Lock, Eye, EyeOff } from "@tamagui/lucide-icons";
import { loginUser } from "../../../utils/api";
import { useAuth } from "../../../utils/AuthContext";
import { useRouter } from 'expo-router';

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await loginUser(username.trim(), password);
      login(data.access_token, data.refresh_token, data.username, data.userId);
      router.replace("/pages/Chat");
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((show) => !show);
  };

  return (
    <Theme name="dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <YStack
          flex={1}
          backgroundColor="#36393f"
          alignItems="center"
          justifyContent="center"
          padding="$4"
        >
          <Card
            size="$4"
            width="100%"
            maxWidth={400}
            backgroundColor="#2f3136"
            padding="$6"
            borderRadius="$6"
            shadowColor="$shadowColor"
            shadowOffset={{ width: 0, height: 8 }}
            shadowOpacity={0.75}
            shadowRadius={24}
            enterStyle={{
              opacity: 0,
              scale: 0.9,
            }}
          >
            <YStack>
              {/* Title */}
              <Text
                fontSize="$8"
                fontWeight="700"
                color="white"
                textAlign="center"
                marginBottom="$2"
              >
                Encrypted Messaging App
              </Text>

              {/* Error Alert */}
              {error && (
                <Card
                  backgroundColor="#f44336"
                  padding="$3"
                  borderRadius="$3"
                  enterStyle={{
                    opacity: 0,
                    y: -10,
                  }}
                >
                  <Text color="white" fontWeight="600">
                    {error}
                  </Text>
                </Card>
              )}

              {/* Username Input */}
              <YStack marginTop="$4">
                <XStack
                  backgroundColor="#202225"
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignItems="center"
                >
                  <User size={20} color="#5865F2" marginRight={"$2"}/>
                  <Input
                    flex={1}
                    placeholder="Username"
                    //@ts-ignore
                    placeholderTextColor="#72767d"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoComplete="username"
                    autoFocus
                    onSubmitEditing={handleLogin}
                    returnKeyType="next"
                    backgroundColor="transparent"
                    borderWidth={0}
                    color="white"
                    fontSize="$4"
                    focusStyle={{
                      borderWidth: 0,
                    }}
                  />
                </XStack>
              </YStack>

              {/* Password Input */}
              <YStack marginTop="$2" marginBottom="$4">
                <XStack
                  backgroundColor="#202225"
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignItems="center"
                >
                  <Lock size={20} color="#5865F2" marginRight={"$2"}/>
                  <Input
                    flex={1}
                    placeholder="Password"
                    //@ts-ignore
                    placeholderTextColor="#72767d"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    {...(!showPassword && Platform.OS === "web" ? { type: "password" } : {})}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    onSubmitEditing={handleLogin}
                    returnKeyType="done"
                    backgroundColor="transparent"
                    borderWidth={0}
                    color="white"
                    fontSize="$4"
                    focusStyle={{
                      borderWidth: 0,
                    }}
                  />
                  <Button
                    backgroundColor={"$color.gray5Dark"}
                    borderWidth={1}
                    borderColor="#5865F2"
                    onPress={togglePasswordVisibility}
                    padding="$2.5"
                    marginLeft={"$2"}
                    pressStyle={{
                      opacity: 0.7,
                    }}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color="#5865F2" />
                    ) : (
                      <Eye size={20} color="#5865F2" />
                    )}
                  </Button>
                </XStack>
              </YStack>

              {/* Login Button */}
              <Button
                size="$5"
                backgroundColor="#5865F2"
                onPress={handleLogin}
                disabled={loading}
                borderRadius="$3"
                pressStyle={{
                  backgroundColor: "#4752c4",
                  scale: 0.98,
                }}
                disabledStyle={{
                  opacity: 0.6,
                }}
                icon={loading ? <Spinner color="white" /> : undefined}
              >
                {loading ? "Logging in..." : "Login"}
              </Button>

              {/* Register Link */}
              <XStack justifyContent="center" marginTop="$3">
                <Text color="#b9bbbe" fontSize="$3">
                  Don't have an account?
                </Text>
              </XStack>
              <XStack justifyContent="center">
                <Text
                  color="#5865F2"
                  fontWeight="700"
                  fontSize="$3"
                  onPress={() => router.replace("/pages/Register")}
                  pressStyle={{
                    opacity: 0.7,
                  }}
                >
                  <Button.Text>
                    Register
                  </Button.Text>
                </Text>
              </XStack>
            </YStack>
          </Card>
        </YStack>
      </KeyboardAvoidingView>
    </Theme>
  );
};

export default LoginPage;