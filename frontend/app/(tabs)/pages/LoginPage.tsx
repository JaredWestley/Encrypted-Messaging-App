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
import { Alert, KeyboardAvoidingView, Platform } from "react-native";
import { User, Lock, Eye, EyeOff } from "@tamagui/lucide-icons";
import { useNavigation } from "@react-navigation/native";
import { loginUser } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Chat: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const LoginPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
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
      login(data.access_token, data.username, data.userId);
      navigation.navigate("Chat");
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
                fontSize="$9"
                fontWeight="700"
                color="white"
                textAlign="center"
                marginBottom="$2"
              >
                Welcome Back
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
              <YStack>
                <XStack
                  backgroundColor="#202225"
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignItems="center"
                >
                  <User size={20} color="#5865F2" />
                  <Input
                    flex={1}
                    placeholder="Username"
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
                    padding={0}
                    focusStyle={{
                      borderWidth: 0,
                    }}
                  />
                </XStack>
              </YStack>

              {/* Password Input */}
              <YStack>
                <XStack
                  backgroundColor="#202225"
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignItems="center"
                >
                  <Lock size={20} color="#5865F2" />
                  <Input
                    flex={1}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    onSubmitEditing={handleLogin}
                    returnKeyType="done"
                    backgroundColor="transparent"
                    borderWidth={0}
                    color="white"
                    fontSize="$4"
                    padding={0}
                    focusStyle={{
                      borderWidth: 0,
                    }}
                  />
                  <Button
                    unstyled
                    onPress={togglePasswordVisibility}
                    padding="$2"
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
              <XStack justifyContent="center" marginTop="$2">
                <Text color="#b9bbbe" fontSize="$3">
                  Don't have an account?
                </Text>
                <Text
                  color="#5865F2"
                  fontWeight="700"
                  fontSize="$3"
                  onPress={() => navigation.navigate("Register")}
                  pressStyle={{
                    opacity: 0.7,
                  }}
                >
                  Register
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