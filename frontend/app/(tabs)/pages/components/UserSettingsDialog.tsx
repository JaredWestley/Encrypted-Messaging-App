import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Input, Separator, ScrollView } from "tamagui";
import { Modal, TouchableOpacity, Image, Alert as RNAlert, Platform } from "react-native";
import { X } from "@tamagui/lucide-icons";
import * as ImagePicker from "expo-image-picker";
import { updateUserSettings, fetchCurrentUser, uploadUserIcon } from "../../../../utils/api";
import { BASE_URL } from "../../../../utils/config";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from "../../../../utils/PreferencesContext";

interface UserSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  logout: () => void;
}

type ChangeType = "username" | "email" | "password" | null;

const UserSettingsDialog: React.FC<UserSettingsDialogProps> = ({
  open,
  onClose,
  token,
  logout,
}) => {
  const insets = useSafeAreaInsets();
  const { fontSize, setFontSize, dyslexiaFont, setDyslexiaFont, colorBlindMode, setColorBlindMode, fontSizeValue, fontFamily } = usePreferences();
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [changeDialogOpen, setChangeDialogOpen] = useState<ChangeType>(null);

  // Change dialog inputs
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verifyNewPassword, setVerifyNewPassword] = useState("");
  const [currentIcon, setCurrentIcon] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [userIconUrl, setUserIconUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState("");

  const resetChangeDialogFields = () => {
    setNewUsername("");
    setNewEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setVerifyNewPassword("");
  };

  const openChangeDialog = (type: ChangeType) => {
    resetChangeDialogFields();
    setChangeDialogOpen(type);
  };

  const closeChangeDialog = () => {
    resetChangeDialogFields();
    setChangeDialogOpen(null);
  };

  const handleUsernameUpdate = async () => {
    if (!newUsername.trim()) {
      RNAlert.alert("Error", "Please enter a new username.");
      return;
    }
    if (!currentPassword) {
      RNAlert.alert("Error", "Please confirm your current password.");
      return;
    }
    try {
      const res = await updateUserSettings(
        { username: newUsername, current_password: currentPassword },
        token,
        logout
      );
      RNAlert.alert("Success", "Username updated successfully");
      setCurrentUsername(res.user.username);
      closeChangeDialog();
    } catch (error: any) {
      RNAlert.alert("Error", error.message);
    }
  };

  const handleEmailUpdate = async () => {
    if (!newEmail.trim()) {
      RNAlert.alert("Error", "Please enter a new email.");
      return;
    }
    if (!currentPassword) {
      RNAlert.alert("Error", "Please confirm your current password.");
      return;
    }
    try {
      await updateUserSettings({ email: newEmail, current_password: currentPassword }, token, logout);
      RNAlert.alert("Success", "Email updated successfully");
      setCurrentEmail(newEmail);
      closeChangeDialog();
    } catch (error: any) {
      RNAlert.alert("Error", error.message);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!currentPassword) {
      RNAlert.alert("Error", "Please confirm your current password.");
      return;
    }
    if (!newPassword) {
      RNAlert.alert("Error", "Please enter a new password.");
      return;
    }
    if (newPassword !== verifyNewPassword) {
      RNAlert.alert("Error", "New password and verification do not match.");
      return;
    }
    try {
      await updateUserSettings({ current_password: currentPassword, new_password: newPassword }, token, logout);
      RNAlert.alert("Success", "Password updated successfully");
      closeChangeDialog();
    } catch (error: any) {
      RNAlert.alert("Error", error.message);
    }
  };

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const user = await fetchCurrentUser(token, logout);
        setCurrentUsername(user.username);
        setCurrentEmail(user.email);
        setCurrentIcon(user.icon_url);
        setUserIconUrl(user.icon_url ? BASE_URL + user.icon_url : null);
        setBio(user.bio || "");
        setBioInput(user.bio || "");
      } catch (error) {
        console.error("Failed to fetch user info:", error);
      }
    };

    if (open) {
      loadUserInfo();
    }
  }, [open, token, logout]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      RNAlert.alert("Permission Denied", "We need camera roll permissions.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setPreviewUri(result.assets[0].uri);
    }
  };

  const handleIconUpload = async () => {
    if (!previewUri) return;

    const formData = new FormData();
    const filename = previewUri.split("/").pop() || "upload.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";

    if (Platform.OS === "web") {
      // On web, fetch the URI as a blob and append it properly
      const response = await fetch(previewUri);
      const blob = await response.blob();
      formData.append("file", blob, filename);
    } else {
      // On native, the { uri, name, type } object works with React Native's FormData
      formData.append("file", {
        uri: previewUri,
        name: filename,
        type,
      } as any);
    }

    try {
      const res = await uploadUserIcon(formData, token, logout);
      if (Platform.OS === "web") {
        window.alert("Icon uploaded successfully!");
      } else {
        RNAlert.alert("Success", "Icon uploaded successfully!");
      }
      // Cache-bust the URL so the browser loads the new image
      setUserIconUrl(BASE_URL + res.icon_url + "?t=" + Date.now());
      setPreviewUri(null);
    } catch (error: any) {
      if (Platform.OS === "web") {
        window.alert("Upload failed: " + error.message);
      } else {
        RNAlert.alert("Error", "Upload failed: " + error.message);
      }
    }
  };

  const handleBioSave = async () => {
    try {
      await updateUserSettings({ bio: bioInput }, token, logout);
      setBio(bioInput);
      setEditingBio(false);
      if (Platform.OS === "web") {
        window.alert("Bio updated successfully!");
      } else {
        RNAlert.alert("Success", "Bio updated successfully!");
      }
    } catch (error: any) {
      if (Platform.OS === "web") {
        window.alert("Failed to update bio: " + error.message);
      } else {
        RNAlert.alert("Error", "Failed to update bio: " + error.message);
      }
    }
  };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <>
      {/* Main Settings Dialog */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.8)">
          <XStack
            height={64 + insets.top} // Adjust height to include safe area
            backgroundColor="#171823"
            paddingHorizontal="$4"
            paddingTop={insets.top}
            alignItems="flex-end" // Align to bottom of container
            paddingBottom="$3" // Add some bottom padding
            justifyContent="space-between"
          >
            <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
              User Settings
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </XStack>

          <ScrollView 
            flex={1} 
            backgroundColor="#1E1F2B" 
            padding="$4"
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20 // Add bottom safe area padding
            }}
          >
            <YStack paddingTop="$2">
              <YStack>
                <Text fontWeight="700" color="white" marginBottom="$2" fontFamily={fontFamily}>
                  Username:
                </Text>
                <Text color="#9CA3AF" marginBottom="$2" fontFamily={fontFamily}>{currentUsername || "Not set"}</Text>
              </YStack>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#0EA5E9"
                onPress={() => openChangeDialog("username")}
                paddingTop={4}
              >
                Change Username
              </Button>

              <Separator borderColor="#2D2E3F" marginTop="$4"/>

              <YStack>
                <Text fontWeight="700" color="white" marginTop="$3" fontFamily={fontFamily}>
                  Email:
                </Text>
                <Text color="#9CA3AF" marginTop="$2" fontFamily={fontFamily}>{currentEmail || "Not set"}</Text>
              </YStack>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#0EA5E9"
                onPress={() => openChangeDialog("email")}
                marginTop="$2"
              >
                Change Email
              </Button>

              <Separator borderColor="#2D2E3F" marginTop="$4"/>

              <Text fontWeight="700" color="white" marginTop="$3" fontFamily={fontFamily}>
                Password
              </Text>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#0EA5E9"
                onPress={() => openChangeDialog("password")}
                marginTop="$2"
              >
                Change Password
              </Button>

              <Separator borderColor="#2D2E3F" marginTop="$4"/>

              <Text fontWeight="700" color="white" marginTop="$3" marginBottom="$2" fontFamily={fontFamily}>
                Profile Icon
              </Text>
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
                />
              ) : userIconUrl && userIconUrl !== "null" ? (
                <Image
                  source={{ uri: userIconUrl }}
                  style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
                />
              ) : currentIcon ? (
                <Image
                  source={{ uri: `${BASE_URL}${currentIcon}` }}
                  style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
                />
              ) : (
                <YStack
                  width={80}
                  height={80}
                  borderRadius={40}
                  backgroundColor="#6B7280"
                  justifyContent="center"
                  alignItems="center"
                  marginBottom={8}
                >
                  <Text fontSize="$9" fontWeight="700" color="white" fontFamily={fontFamily}>
                    {getFirstLetter(currentUsername)}
                  </Text>
                </YStack>
              )}

              <XStack marginTop="$2">
                <Button
                  flex={1}
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#0EA5E9"
                  onPress={pickImage}
                  marginRight="$4"
                >
                  Choose Icon
                </Button>
                <Button
                  flex={1}
                  backgroundColor="#0EA5E9"
                  disabled={!previewUri}
                  onPress={handleIconUpload}
                >
                  Upload Icon
                </Button>
              </XStack>

              <Separator borderColor="#2D2E3F" marginTop="$4" />

              {/* Bio */}
              <Text fontWeight="700" color="white" marginTop="$3" marginBottom="$2" fontFamily={fontFamily}>
                Bio
              </Text>
              {editingBio ? (
                <YStack gap="$2">
                  <Input
                    value={bioInput}
                    onChangeText={setBioInput}
                    placeholder="Tell others about yourself..."
                    //@ts-ignore
                    placeholderTextColor="#6B7280"
                    backgroundColor="#2D2E3F"
                    borderWidth={0}
                    color="white"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    autoFocus
                    fontFamily={fontFamily}
                  />
                  <Text color="#6B7280" fontSize={11} textAlign="right" fontFamily={fontFamily}>
                    {bioInput.length}/500
                  </Text>
                  <XStack gap="$2">
                    <Button
                      flex={1}
                      backgroundColor="#2D2E3F"
                      onPress={() => {
                        setBioInput(bio);
                        setEditingBio(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button flex={1} backgroundColor="#0EA5E9" onPress={handleBioSave}>
                      Save Bio
                    </Button>
                  </XStack>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <Text color="#9CA3AF" fontSize={14} fontFamily={fontFamily}>
                    {bio || "No bio set"}
                  </Text>
                  <Button
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="#0EA5E9"
                    onPress={() => {
                      setBioInput(bio);
                      setEditingBio(true);
                    }}
                  >
                    {bio ? "Edit Bio" : "Add Bio"}
                  </Button>
                </YStack>
              )}

              <Separator borderColor="#2D2E3F" marginTop="$4" />

              {/* Accessibility Settings */}
              <Text fontWeight="700" color="white" marginTop="$3" marginBottom="$2" fontFamily={fontFamily}>
                Accessibility
              </Text>

              {/* Font Size */}
              <YStack
                backgroundColor="#171823"
                borderRadius="$3"
                padding="$3"
                marginBottom="$2"
              >
                <Text fontWeight="600" color="white" marginBottom="$2" fontFamily={fontFamily}>
                  Font Size
                </Text>
                <XStack gap="$2">
                  {(["small", "medium", "large"] as const).map((size) => (
                    <Button
                      key={size}
                      flex={1}
                      size="$3"
                      backgroundColor={fontSize === size ? "#0EA5E9" : "#2D2E3F"}
                      borderWidth={fontSize === size ? 0 : 1}
                      borderColor="#4f545c"
                      onPress={() => setFontSize(size)}
                      pressStyle={{ backgroundColor: fontSize === size ? "#0284C7" : "#4f545c" }}
                    >
                      <Text color="white" fontSize={12} textTransform="capitalize" fontWeight="600" fontFamily={fontFamily}>
                        {size}
                      </Text>
                    </Button>
                  ))}
                </XStack>
              </YStack>

              {/* Dyslexia Font */}
              <YStack
                backgroundColor="#171823"
                borderRadius="$3"
                padding="$3"
                marginBottom="$2"
              >
                <Text fontWeight="600" color="white" marginBottom="$1" fontFamily={fontFamily}>
                  Dyslexia-Friendly Font
                </Text>
                <Text color="#6B7280" fontSize={12} marginBottom="$2" fontFamily={fontFamily}>
                  Uses OpenDyslexic typeface
                </Text>
                <XStack gap="$2">
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor={!dyslexiaFont ? "#2D2E3F" : "#0EA5E9"}
                    borderWidth={!dyslexiaFont ? 1 : 0}
                    borderColor="#4f545c"
                    onPress={() => setDyslexiaFont(true)}
                    pressStyle={{ backgroundColor: !dyslexiaFont ? "#4f545c" : "#0284C7" }}
                  >
                    <Text color="white" fontSize={12} fontWeight="600" fontFamily={fontFamily}>On</Text>
                  </Button>
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor={dyslexiaFont ? "#2D2E3F" : "#0EA5E9"}
                    borderWidth={dyslexiaFont ? 1 : 0}
                    borderColor="#4f545c"
                    onPress={() => setDyslexiaFont(false)}
                    pressStyle={{ backgroundColor: dyslexiaFont ? "#4f545c" : "#0284C7" }}
                  >
                    <Text color="white" fontSize={12} fontWeight="600" fontFamily={fontFamily}>Off</Text>
                  </Button>
                </XStack>
              </YStack>

              {/* Color-Blind Mode */}
              <YStack
                backgroundColor="#171823"
                borderRadius="$3"
                padding="$3"
                marginBottom="$2"
              >
                <Text fontWeight="600" color="white" marginBottom="$1" fontFamily={fontFamily}>
                  Color-Blind Mode
                </Text>
                <Text color="#6B7280" fontSize={12} marginBottom="$2" fontFamily={fontFamily}>
                  Adds shape icons to status indicators
                </Text>
                <XStack gap="$2">
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor={!colorBlindMode ? "#2D2E3F" : "#0EA5E9"}
                    borderWidth={!colorBlindMode ? 1 : 0}
                    borderColor="#4f545c"
                    onPress={() => setColorBlindMode(true)}
                    pressStyle={{ backgroundColor: !colorBlindMode ? "#4f545c" : "#0284C7" }}
                  >
                    <Text color="white" fontSize={12} fontWeight="600" fontFamily={fontFamily}>On</Text>
                  </Button>
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor={colorBlindMode ? "#2D2E3F" : "#0EA5E9"}
                    borderWidth={colorBlindMode ? 1 : 0}
                    borderColor="#4f545c"
                    onPress={() => setColorBlindMode(false)}
                    pressStyle={{ backgroundColor: colorBlindMode ? "#4f545c" : "#0284C7" }}
                  >
                    <Text color="white" fontSize={12} fontWeight="600" fontFamily={fontFamily}>Off</Text>
                  </Button>
                </XStack>
              </YStack>

              <Separator borderColor="#2D2E3F" marginTop="$2" />

              <Button backgroundColor="#EF4444" onPress={logout} marginTop="$4">
                Logout
              </Button>
            </YStack>
          </ScrollView>
        </YStack>
      </Modal>

      {/* Change Username Dialog */}
      <Modal visible={changeDialogOpen === "username"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#171823" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
              Change Username
            </Text>
            <Input
              placeholder="New Username"
              value={newUsername}
              onChangeText={setNewUsername}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              autoFocus
              fontFamily={fontFamily}
            />
            <Input
              placeholder="Confirm Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              fontFamily={fontFamily}
            />
            <XStack>
              <Button flex={1} backgroundColor="#2D2E3F" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#0EA5E9" onPress={handleUsernameUpdate}>
                Save
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Change Email Dialog */}
      <Modal visible={changeDialogOpen === "email"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#171823" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
              Change Email
            </Text>
            <Input
              placeholder="New Email"
              keyboardType="email-address"
              value={newEmail}
              onChangeText={setNewEmail}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              autoFocus
              fontFamily={fontFamily}
            />
            <Input
              placeholder="Confirm Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              fontFamily={fontFamily}
            />
            <XStack>
              <Button flex={1} backgroundColor="#2D2E3F" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#0EA5E9" onPress={handleEmailUpdate}>
                Save
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Change Password Dialog */}
      <Modal visible={changeDialogOpen === "password"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#171823" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
              Change Password
            </Text>
            <Input
              placeholder="Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              autoFocus
              fontFamily={fontFamily}
            />
            <Input
              placeholder="New Password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              fontFamily={fontFamily}
            />
            <Input
              placeholder="Verify New Password"
              secureTextEntry
              value={verifyNewPassword}
              onChangeText={setVerifyNewPassword}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              fontFamily={fontFamily}
            />
            <XStack>
              <Button flex={1} backgroundColor="#2D2E3F" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#0EA5E9" onPress={handlePasswordUpdate}>
                Save
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>
    </>
  );
};

export default UserSettingsDialog;