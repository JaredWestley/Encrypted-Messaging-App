import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Input, Separator, ScrollView } from "tamagui";
import { Modal, TouchableOpacity, Image, Alert as RNAlert, Platform } from "react-native";
import { X } from "@tamagui/lucide-icons";
import * as ImagePicker from "expo-image-picker";
import { updateUserSettings, fetchCurrentUser, uploadUserIcon } from "../../../../utils/api";
import { BASE_URL } from "../../../../utils/config";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
            backgroundColor="#2f3136"
            paddingHorizontal="$4"
            paddingTop={insets.top}
            alignItems="flex-end" // Align to bottom of container
            paddingBottom="$3" // Add some bottom padding
            justifyContent="space-between"
          >
            <Text fontSize="$6" fontWeight="700" color="white">
              User Settings
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#b9bbbe" />
            </TouchableOpacity>
          </XStack>

          <ScrollView 
            flex={1} 
            backgroundColor="#36393f" 
            padding="$4"
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20 // Add bottom safe area padding
            }}
          >
            <YStack paddingTop="$2">
              <YStack>
                <Text fontWeight="700" color="white" marginBottom="$2">
                  Username:
                </Text>
                <Text color="#b9bbbe" marginBottom="$2">{currentUsername || "Not set"}</Text>
              </YStack>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#5865F2"
                onPress={() => openChangeDialog("username")}
                paddingTop={4}
              >
                Change Username
              </Button>

              <Separator borderColor="#40444b" marginTop="$4"/>

              <YStack>
                <Text fontWeight="700" color="white" marginTop="$3">
                  Email:
                </Text>
                <Text color="#b9bbbe" marginTop="$2">{currentEmail || "Not set"}</Text>
              </YStack>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#5865F2"
                onPress={() => openChangeDialog("email")}
                marginTop="$2"
              >
                Change Email
              </Button>

              <Separator borderColor="#40444b" marginTop="$4"/>

              <Text fontWeight="700" color="white" marginTop="$3">
                Password
              </Text>
              <Button
                backgroundColor="transparent"
                borderWidth={1}
                borderColor="#5865F2"
                onPress={() => openChangeDialog("password")}
                marginTop="$2"
              >
                Change Password
              </Button>

              <Separator borderColor="#40444b" marginTop="$4"/>

              <Text fontWeight="700" color="white" marginTop="$3" marginBottom="$2">
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
                  backgroundColor="#757575"
                  justifyContent="center"
                  alignItems="center"
                  marginBottom={8}
                >
                  <Text fontSize="$9" fontWeight="700" color="white">
                    {getFirstLetter(currentUsername)}
                  </Text>
                </YStack>
              )}

              <XStack marginTop="$2">
                <Button
                  flex={1}
                  backgroundColor="transparent"
                  borderWidth={1}
                  borderColor="#5865F2"
                  onPress={pickImage}
                  marginRight="$4"
                >
                  Choose Icon
                </Button>
                <Button
                  flex={1}
                  backgroundColor="#5865F2"
                  disabled={!previewUri}
                  onPress={handleIconUpload}
                >
                  Upload Icon
                </Button>
              </XStack>

              <Separator borderColor="#40444b" marginTop="$4" />

              <Button backgroundColor="#f04747" onPress={logout} marginTop="$4">
                Logout
              </Button>
            </YStack>
          </ScrollView>
        </YStack>
      </Modal>

      {/* Change Username Dialog */}
      <Modal visible={changeDialogOpen === "username"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#2f3136" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white">
              Change Username
            </Text>
            <Input
              placeholder="New Username"
              value={newUsername}
              onChangeText={setNewUsername}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              autoFocus
            />
            <Input
              placeholder="Confirm Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
            />
            <XStack>
              <Button flex={1} backgroundColor="#40444b" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#5865F2" onPress={handleUsernameUpdate}>
                Save
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Change Email Dialog */}
      <Modal visible={changeDialogOpen === "email"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#2f3136" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white">
              Change Email
            </Text>
            <Input
              placeholder="New Email"
              keyboardType="email-address"
              value={newEmail}
              onChangeText={setNewEmail}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              autoFocus
            />
            <Input
              placeholder="Confirm Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
            />
            <XStack>
              <Button flex={1} backgroundColor="#40444b" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#5865F2" onPress={handleEmailUpdate}>
                Save
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Change Password Dialog */}
      <Modal visible={changeDialogOpen === "password"} transparent animationType="fade">
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.7)" justifyContent="center" padding="$4">
          <YStack backgroundColor="#2f3136" borderRadius="$4" padding="$4">
            <Text fontSize="$6" fontWeight="700" color="white">
              Change Password
            </Text>
            <Input
              placeholder="Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
              autoFocus
            />
            <Input
              placeholder="New Password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
            />
            <Input
              placeholder="Verify New Password"
              secureTextEntry
              value={verifyNewPassword}
              onChangeText={setVerifyNewPassword}
              backgroundColor="#40444b"
              borderWidth={0}
              color="white"
            />
            <XStack>
              <Button flex={1} backgroundColor="#40444b" onPress={closeChangeDialog}>
                Cancel
              </Button>
              <Button flex={1} backgroundColor="#5865F2" onPress={handlePasswordUpdate}>
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