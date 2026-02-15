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
  ScrollView,
} from "tamagui";
import { KeyboardAvoidingView, Platform } from "react-native";
import { User, Mail, Lock, Eye, EyeOff } from "@tamagui/lucide-icons";
import { useRouter } from "expo-router";
import { registerUser } from "../utils/api";

const RegisterPage: React.FC = () => {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword((show) => !show);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword((show) => !show);
  };

  const validatePasswordStrength = (pw: string): string | null => {
    if (pw.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
    if (!/\d/.test(pw)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(pw)) return "Password must contain at least one special character.";
    return null;
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill out all fields.");
      return;
    }

    // Username validation
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
      setError("Username must be between 3 and 32 characters.");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    // Password strength validation
    const pwError = validatePasswordStrength(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await registerUser(username.trim(), email.trim(), password);
      router.replace("/pages/Login");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Theme name="dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
          }}
        >
          <YStack
            flex={1}
            backgroundColor="#36393f"
            alignItems="center"
            justifyContent="center"
            padding="$4"
            minHeight="100%"
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
                  Create Account
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
                      placeholderTextColor="#72767d"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoComplete="username"
                      autoFocus
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

                {/* Email Input */}
                <YStack>
                  <XStack
                    backgroundColor="#202225"
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    alignItems="center"
                  >
                    <Mail size={20} color="#5865F2" />
                    <Input
                      flex={1}
                      placeholder="Email"
                      placeholderTextColor="#72767d"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
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
                      placeholderTextColor="#72767d"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      {...(!showPassword && Platform.OS === "web" ? { type: "password" } : {})}
                      autoCapitalize="none"
                      autoComplete="password-new"
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

                {/* Confirm Password Input */}
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
                      placeholder="Confirm Password"
                      placeholderTextColor="#72767d"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      {...(!showConfirmPassword && Platform.OS === "web" ? { type: "password" } : {})}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      onSubmitEditing={handleRegister}
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
                      onPress={toggleConfirmPasswordVisibility}
                      padding="$2"
                      pressStyle={{
                        opacity: 0.7,
                      }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={20} color="#5865F2" />
                      ) : (
                        <Eye size={20} color="#5865F2" />
                      )}
                    </Button>
                  </XStack>
                </YStack>

                {/* Register Button */}
                <Button
                  size="$5"
                  backgroundColor="#5865F2"
                  onPress={handleRegister}
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
                  {loading ? "Registering..." : "Register"}
                </Button>

                {/* Login Link */}
                <XStack justifyContent="center" marginTop="$2">
                  <Text color="#b9bbbe" fontSize="$3">
                    Already have an account?
                  </Text>
                  <Text
                    color="#5865F2"
                    fontWeight="700"
                    fontSize="$3"
                    onPress={() => router.replace("/pages/Login")}
                    pressStyle={{
                      opacity: 0.7,
                    }}
                  >
                    Login
                  </Text>
                </XStack>
              </YStack>
            </Card>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Theme>
  );
};

export default RegisterPage;