import React, { useState } from "react";
import { YStack, XStack, Text, Input, Button, Separator } from "tamagui";
import { Alert as RNAlert, Image, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { renameServer, deleteServer, uploadServerIcon, updateServerSettings } from "../../../../utils/api";
import { BASE_URL } from "../../../../utils/config";
import { usePreferences } from "../../../../utils/PreferencesContext";

interface ServerSettingsProps {
  serverId: number;
  token: string;
  logout: () => void;
  currentIcon?: string;
  currentName: string;
  isOwner: boolean;
  currentSlowMode?: number;
  onServerDeleted: () => void;
  onServerRenamed: (newName: string) => void;
  onServerIconUpdated: (newIconUrl: string) => void;
  onSlowModeChanged?: (seconds: number) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({
  serverId,
  token,
  logout,
  currentIcon,
  currentName,
  isOwner,
  onServerDeleted,
  onServerRenamed,
  onServerIconUpdated,
  currentSlowMode = 0,
  onSlowModeChanged,
}) => {
  const { fontSizeValue, fontFamily } = usePreferences();
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [slowMode, setSlowMode] = useState(currentSlowMode);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [serverIconUrl, setServerIconUrl] = useState<string | null>(null);

  const showToast = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === currentName) return;

    try {
      setLoading(true);
      const response = await renameServer(token, serverId, newName, logout);
      onServerRenamed(newName);
      showToast(response.detail || "Server renamed successfully.");
    } catch (err: any) {
      RNAlert.alert("Error", err.message || "Failed to rename server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner) {
      if (Platform.OS === "web") {
        window.alert("Only the server owner can delete the server");
      } else {
        RNAlert.alert("Error", "Only the server owner can delete the server");
      }
      return;
    }

    const doDelete = async () => {
      try {
        setLoading(true);
        await deleteServer(token, serverId, logout);
        onServerDeleted();
      } catch (err: any) {
        if (Platform.OS === "web") {
          window.alert(err.message || "Failed to delete server.");
        } else {
          RNAlert.alert("Error", err.message || "Failed to delete server.");
        }
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this server? This action is irreversible.")) {
        await doDelete();
      }
    } else {
      RNAlert.alert(
        "Delete Server",
        "Are you sure you want to delete this server? This action is irreversible.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      RNAlert.alert("Permission Denied", "We need camera roll permissions to change the server icon.");
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
      setLoading(true);
      const res = await uploadServerIcon(formData, serverId, token, logout);
      // Cache-bust so browser loads new image
      setServerIconUrl(BASE_URL + res.icon_url + "?t=" + Date.now());
      setPreviewUri(null);
      onServerIconUpdated(res.icon_url);
      showToast("Server icon uploaded successfully.");
    } catch (error: any) {
      RNAlert.alert("Error", "Upload failed: " + error.message);
    } finally {
      setLoading(false);
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
    <YStack>
      <Text fontSize="$6" fontWeight="700" color="white" fontFamily={fontFamily}>
        Edit Server
      </Text>

      {/* Server Name */}
      <YStack marginTop="$2">
        <Text color="#9CA3AF" fontSize="$3" fontFamily={fontFamily}>
          Server Name
        </Text>
        <Input
          value={newName}
          onChangeText={setNewName}
          disabled={!isOwner || loading}
          backgroundColor="#2D2E3F"
          borderWidth={0}
          color="white"
          marginTop="$2"
          fontFamily={fontFamily}
        />
        <Button
          backgroundColor="#0EA5E9"
          onPress={handleRename}
          disabled={loading || !newName.trim() || newName === currentName || !isOwner}
          marginTop="$2"
          marginBottom="$2"
        >
          Save Changes
        </Button>
      </YStack>

      <Separator borderColor="#444" marginVertical="$2" />

      {/* Server Icon */}
      <YStack>
        <Text color="#9CA3AF" fontSize="$3" marginBottom="$2" fontFamily={fontFamily}>
          Server Icon
        </Text>
        
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
          />
        ) : serverIconUrl ? (
          <Image
            source={{ uri: serverIconUrl }}
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
              {getFirstLetter(currentName)}
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
            disabled={!isOwner || loading}
          >
            Choose Icon
          </Button>
          <Button
            flex={1}
            backgroundColor="#0EA5E9"
            onPress={handleIconUpload}
            disabled={!previewUri || loading}
          >
            Upload
          </Button>
        </XStack>
      </YStack>

      {/* Slow Mode */}
      {isOwner && (
        <>
          <Separator borderColor="#444" marginVertical="$2" />
          <YStack>
            <Text color="#9CA3AF" fontSize="$3" marginBottom="$2" fontFamily={fontFamily}>
              Slow Mode
            </Text>
            <Text color="#6B7280" fontSize="$2" marginBottom="$2" fontFamily={fontFamily}>
              Limit how often members can send messages.
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              {[
                { label: "Off", value: 0 },
                { label: "5s", value: 5 },
                { label: "10s", value: 10 },
                { label: "30s", value: 30 },
                { label: "1m", value: 60 },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  size="$3"
                  backgroundColor={slowMode === opt.value ? "#0EA5E9" : "#2D2E3F"}
                  borderWidth={slowMode === opt.value ? 0 : 1}
                  borderColor="#4f545c"
                  onPress={async () => {
                    try {
                      await updateServerSettings(token, serverId, { slow_mode_seconds: opt.value }, logout);
                      setSlowMode(opt.value);
                      onSlowModeChanged?.(opt.value);
                      showToast(`Slow mode ${opt.value === 0 ? "disabled" : "set to " + opt.label}`);
                    } catch (err: any) {
                      showToast("Failed to update slow mode");
                    }
                  }}
                  disabled={loading}
                  pressStyle={{ backgroundColor: slowMode === opt.value ? "#0284C7" : "#4f545c" }}
                >
                  <Text color="white" fontSize={12} fontWeight="600" fontFamily={fontFamily}>{opt.label}</Text>
                </Button>
              ))}
            </XStack>
          </YStack>
        </>
      )}

      {/* Danger Zone */}
      {isOwner && (
        <>
          <Separator borderColor="#444" marginVertical="$4" />
          <YStack>
            <Text fontSize="$5" fontWeight="700" color="#EF4444" fontFamily={fontFamily}>
              Danger Zone
            </Text>
            <Text color="#9CA3AF" fontSize="$3" marginTop="$2" fontFamily={fontFamily}>
              Deleting a server is permanent and cannot be undone.
            </Text>
            <Button
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#EF4444"
              onPress={handleDelete}
              disabled={loading}
              marginTop="$2"
            >
              Delete Server
            </Button>
          </YStack>
        </>
      )}

      {/* Snackbar */}
      {snackbarVisible && (
        <YStack
          position="absolute"
          bottom={20}
          alignSelf="center"
          backgroundColor="#252636"
          padding="$3"
          borderRadius="$3"
          enterStyle={{
            opacity: 0,
            y: 20,
          }}
        >
          <Text color="white" fontFamily={fontFamily}>{snackbarMessage}</Text>
        </YStack>
      )}
    </YStack>
  );
};

export default ServerSettings;